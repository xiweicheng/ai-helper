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
      description: '点击或悬停元素',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['click', 'hover'] },
          tabId: { type: 'integer' },
          selector: { type: 'string' },
          waitTime: { type: 'integer' },
          timeout: { type: 'integer' }
        },
        required: ['action', 'tabId', 'selector']
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
          tabId: { type: 'integer' },
          target: { type: 'string', enum: ['selector', 'top', 'bottom', 'coordinates'] },
          selector: { type: 'string' },
          x: { type: 'integer' },
          y: { type: 'integer' },
          align: { type: 'string', enum: ['start', 'center', 'end', 'nearest'] },
          behavior: { type: 'string', enum: ['smooth', 'auto'] }
        },
        required: ['tabId']
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
      description: '等待元素',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer' },
          selector: { type: 'string' },
          state: { type: 'string', enum: ['appeared', 'disappeared', 'visible', 'hidden'] },
          timeout: { type: 'integer' }
        },
        required: ['tabId', 'selector']
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
      description: '拖拽元素',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer' },
          sourceSelector: { type: 'string' },
          targetSelector: { type: 'string' }
        },
        required: ['tabId', 'sourceSelector', 'targetSelector']
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
          tabId: { type: 'integer' },
          timeout: { type: 'integer' },
          waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] }
        },
        required: ['tabId']
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
      description: '填充表单',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer' },
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
        required: ['tabId', 'fields']
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
      description: '键盘输入',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer' },
          key: { type: 'string' },
          text: { type: 'string' },
          ctrlKey: { type: 'boolean' },
          shiftKey: { type: 'boolean' },
          altKey: { type: 'boolean' }
        },
        required: ['tabId']
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
          tabId: { type: 'integer' },
          selector: { type: 'string' },
          fileName: { type: 'string' },
          fileContent: { type: 'string', description: '文件内容(base64)' },
          fileType: { type: 'string', description: 'MIME类型，如image/png' }
        },
        required: ['tabId', 'selector', 'fileName', 'fileContent']
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
      description: '下拉选择',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer' },
          triggerSelector: { type: 'string' },
          optionText: { type: 'string' },
          optionSelector: { type: 'string' },
          timeout: { type: 'integer' }
        },
        required: ['tabId', 'triggerSelector', 'optionText']
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
      description: '获取页面内容',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer' },
          format: { type: 'string', enum: ['text', 'html'] },
          selector: { type: 'string' },
          maxLength: { type: 'integer' }
        },
        required: ['tabId']
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
          tabId: { type: 'integer' },
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
        required: ['tabId', 'dataType']
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
      description: '查询交互元素',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer' },
          filterByText: { type: 'string' },
          elementTypes: {
            type: 'array',
            items: { type: 'string', enum: ['button', 'input', 'select', 'textarea', 'a', 'checkbox', 'radio', 'menuitem'] }
          },
          maxResults: { type: 'integer' },
          countOnly: { type: 'boolean' }
        },
        required: ['tabId']
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
          tabId: { type: 'integer' },
          query: { type: 'string' },
          mode: { type: 'string', enum: ['plain', 'regex'] },
          caseSensitive: { type: 'boolean' },
          contextLength: { type: 'integer' },
          maxResults: { type: 'integer' },
          highlight: { type: 'boolean' }
        },
        required: ['tabId', 'query']
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
          tabId: { type: 'integer' },
          selector: { type: 'string' },
          maxResults: { type: 'integer' }
        },
        required: ['tabId', 'selector']
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
          tabId: { type: 'integer' },
          selector: { type: 'string' },
          includeNested: { type: 'boolean' },
          maxLength: { type: 'integer' }
        },
        required: ['tabId']
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
          tabId: { type: 'integer' },
          scrollPixels: { type: 'integer' },
          maxScrolls: { type: 'integer' },
          pauseMs: { type: 'integer' },
          selector: { type: 'string' }
        },
        required: ['tabId']
      }
    }
  },
];
