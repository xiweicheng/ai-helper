// browser-tools - page interaction + form operation + content extraction 工具定义

export const BROWSER_TOOLS = [
  {
    id: 'click_element',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'click_element',
      description: '点击页面元素',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS选择器' },
          waitTime: { type: 'integer', description: '点击后等待时间（ms），默认500', default: 500 },
          timeout: { type: 'integer', description: '元素查找超时（ms），默认3000', default: 3000 }
        },
        required: ['selector']
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
      description: '滚动页面到指定位置',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', enum: ['selector', 'top', 'bottom', 'coordinates'], description: '滚动目标类型', default: 'selector' },
          selector: { type: 'string', description: '目标元素选择器' },
          x: { type: 'integer', description: 'X坐标', default: 0 },
          y: { type: 'integer', description: 'Y坐标', default: 0 },
          align: { type: 'string', enum: ['start', 'center', 'end', 'nearest'], description: '对齐方式', default: 'center' },
          behavior: { type: 'string', enum: ['smooth', 'auto'], description: '滚动行为', default: 'smooth' }
        },
        required: []
      }
    }
  },
  {
    id: 'hover_element',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'hover_element',
      description: '鼠标悬停在元素上',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS选择器' }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'wait_for_element',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'wait_for_element',
      description: '等待元素状态变化',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS选择器' },
          state: { type: 'string', enum: ['appeared', 'disappeared', 'visible', 'hidden'], description: '等待状态', default: 'appeared' },
          timeout: { type: 'integer', description: '超时（ms），默认10000', default: 10000 }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'drag_and_drop',
    category: 'page_interaction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'drag_and_drop',
      description: '拖拽元素到目标位置（实验性）',
      parameters: {
        type: 'object',
        properties: {
          sourceSelector: { type: 'string', description: '源元素CSS选择器' },
          targetSelector: { type: 'string', description: '目标元素CSS选择器' }
        },
        required: ['sourceSelector', 'targetSelector']
      }
    }
  },
  {
    id: 'wait_for_navigation',
    category: 'page_interaction',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'wait_for_navigation',
      description: '等待页面导航完成',
      parameters: {
        type: 'object',
        properties: {
          timeout: { type: 'integer', description: '超时（ms），默认30000', default: 30000 },
          waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: '等待目标', default: 'load' }
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
      description: '批量填充表单字段',
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: '字段CSS选择器' },
                value: { type: 'string', description: '填充值' },
                fieldType: { type: 'string', enum: ['text', 'select', 'checkbox', 'radio', 'contenteditable'], description: '字段类型', default: 'text' }
              },
              required: ['selector', 'value']
            },
            description: '表单字段列表'
          },
          waitTime: { type: 'integer', description: '填充后等待（ms），默认500', default: 500 }
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
      description: '模拟键盘按键或输入文本',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '按键名，如Enter、Escape、Ctrl+S' },
          text: { type: 'string', description: '直接输入的文本' },
          ctrlKey: { type: 'boolean', description: '按下Ctrl', default: false },
          shiftKey: { type: 'boolean', description: '按下Shift', default: false },
          altKey: { type: 'boolean', description: '按下Alt', default: false }
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
      description: '向文件上传控件注入文件',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'input[type=file]的选择器' },
          fileName: { type: 'string', description: '文件名' },
          fileContent: { type: 'string', description: '文件内容（base64或文本）' },
          fileType: { type: 'string', description: 'MIME类型', default: 'application/octet-stream' }
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
      description: '在下拉菜单中选择选项',
      parameters: {
        type: 'object',
        properties: {
          triggerSelector: { type: 'string', description: '下拉触发器CSS选择器' },
          optionText: { type: 'string', description: '要选择的选项文本' },
          optionSelector: { type: 'string', description: '选项容器选择器（可选）' },
          timeout: { type: 'integer', description: '等待超时（ms），默认5000', default: 5000 }
        },
        required: ['triggerSelector', 'optionText']
      }
    }
  },
  // ── 合并后的内容提取工具 ──
  {
    id: 'get_page_content',
    category: 'content_extraction',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'get_page_content',
      description: '获取页面内容（自动穿透Shadow DOM和同源iframe）',
      parameters: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['text', 'html'], description: '输出格式：text=纯文本，html=完整HTML', default: 'text' },
          selector: { type: 'string', description: '限制提取范围的CSS选择器' },
          maxLength: { type: 'integer', description: '最大字符数，默认15000', default: 15000 },
          tabId: { type: 'integer', description: '目标标签页的ID（可通过 get_tabs 获取），不指定则使用当前会话关联的标签页' }
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
      description: '提取页面结构化数据（表格/链接/表单等）',
      parameters: {
        type: 'object',
        properties: {
          dataType: { type: 'string', enum: ['table', 'metadata', 'links', 'forms', 'images'], description: '数据类型' },
          selector: { type: 'string', description: '限定提取范围的CSS选择器' },
          filterType: { type: 'string', enum: ['all', 'internal', 'external'], description: '链接过滤（仅dataType=links时有效）', default: 'all' },
          includeHeaders: { type: 'boolean', description: '表格包含表头（仅table时），默认true', default: true },
          format: { type: 'string', enum: ['json', 'markdown'], description: '表格输出格式（仅table时），默认json', default: 'json' },
          includeImages: { type: 'boolean', description: '链接中含图片链接（仅links时），默认false', default: false },
          minWidth: { type: 'integer', description: '图片最小宽度（仅images时），默认0', default: 0 },
          minHeight: { type: 'integer', description: '图片最小高度（仅images时），默认0', default: 0 },
          maxResults: { type: 'integer', description: '最大结果数，默认100', default: 100 },
          tabId: { type: 'integer', description: '目标标签页的ID（可通过 get_tabs 获取），不指定则使用当前会话关联的标签页' }
        },
        required: ['dataType']
      }
    }
  },
  {
    id: 'query_interactive_elements',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'query_interactive_elements',
      description: '获取页面可交互元素列表（推荐优先使用）',
      parameters: {
        type: 'object',
        properties: {
          filterByText: { type: 'string', description: '按文本内容过滤' },
          elementTypes: {
            type: 'array',
            items: { type: 'string', enum: ['button', 'input', 'select', 'textarea', 'a', 'checkbox', 'radio', 'menuitem'] },
            description: '筛选元素类型'
          },
          maxResults: { type: 'integer', description: '最大返回数量，默认100', default: 100 },
          countOnly: { type: 'boolean', description: '仅返回匹配数量（省Token），默认false', default: false }
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
      description: '在页面中搜索文本',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          mode: { type: 'string', enum: ['plain', 'regex'], description: '搜索模式', default: 'plain' },
          caseSensitive: { type: 'boolean', description: '区分大小写', default: false },
          contextLength: { type: 'integer', description: '上下文长度（字符），默认50', default: 50 },
          maxResults: { type: 'integer', description: '最大匹配数，默认20', default: 20 },
          highlight: { type: 'boolean', description: '高亮匹配结果', default: false }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'find_similar_elements',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'find_similar_elements',
      description: '查找结构相似的元素（如商品卡片）',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '参考元素CSS选择器' },
          maxResults: { type: 'integer', description: '最大结果数，默认50', default: 50 }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'get_iframe_content',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'get_iframe_content',
      description: '获取同源iframe文本内容（自动穿透Shadow DOM）',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'iframe的CSS选择器，默认所有', default: 'iframe' },
          includeNested: { type: 'boolean', description: '递归获取嵌套iframe', default: false },
          maxLength: { type: 'integer', description: '每个iframe最大文本长度', default: 10000 }
        },
        required: []
      }
    }
  },
  
  {
    id: 'scroll_and_collect',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'scroll_and_collect',
      description: '滚动页面并持续收集文本（无限滚动页面）',
      parameters: {
        type: 'object',
        properties: {
          scrollPixels: { type: 'integer', description: '每次滚动像素，默认800', default: 800 },
          maxScrolls: { type: 'integer', description: '最大滚动次数，默认20', default: 20 },
          pauseMs: { type: 'integer', description: '滚动间暂停（ms），默认500', default: 500 },
          selector: { type: 'string', description: '限定收集区域的选择器' }
        },
        required: []
      }
    }
  },
];
