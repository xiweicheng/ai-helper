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
      description: '点击网页上的指定元素，支持CSS选择器定位。适用于自动化操作，如点击按钮、链接、提交表单等',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS选择器，如 #submit-btn, .login-button, a[href="xxx"]'
          },
          waitTime: {
            type: 'integer',
            description: '点击后等待时间（毫秒），默认500ms',
            default: 500
          },
          timeout: {
            type: 'integer',
            description: '元素查找超时时间（毫秒），默认3000ms',
            default: 3000
          }
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
      description: '滚动到指定位置，支持滚动到元素、页面顶部、页面底部或指定坐标。滚动到元素时可指定对齐方式。适用于加载更多内容或定位到特定区域',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: '滚动目标：selector（元素选择器，默认）、top（顶部）、bottom（底部）、coordinates（坐标）',
            enum: ['selector', 'top', 'bottom', 'coordinates'],
            default: 'selector'
          },
          selector: {
            type: 'string',
            description: '元素选择器（当target为selector时必填）'
          },
          x: {
            type: 'integer',
            description: 'X坐标（当target为coordinates时使用）',
            default: 0
          },
          y: {
            type: 'integer',
            description: 'Y坐标（当target为coordinates时使用）',
            default: 0
          },
          align: {
            type: 'string',
            description: '元素对齐方式（仅target=selector时生效）：start（顶部）、center（居中）、end（底部）、nearest（最近）',
            enum: ['start', 'center', 'end', 'nearest'],
            default: 'center'
          },
          behavior: {
            type: 'string',
            description: '滚动行为：smooth（平滑滚动）、auto（立即滚动）',
            enum: ['smooth', 'auto'],
            default: 'smooth'
          }
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
      description: '鼠标悬停在指定元素上。用于展开下拉菜单、显示详情、触发hover效果等场景',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS选择器'
          }
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
      description: '等待指定元素出现/消失/可见状态变化。用于处理SPA异步渲染、懒加载等场景，比盲目sleep更可靠',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS选择器'
          },
          state: {
            type: 'string',
            description: '等待的状态：appeared（出现）、disappeared（消失）、visible（可见）、hidden（隐藏）',
            enum: ['appeared', 'disappeared', 'visible', 'hidden'],
            default: 'appeared'
          },
          timeout: {
            type: 'integer',
            description: '超时时间（毫秒），默认10000',
            default: 10000
          }
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
      description: '模拟拖拽操作，将源元素拖放到目标元素位置。适用于看板排序、文件拖放、排序列表等场景。注意：此为实验性功能，部分复杂拖拽交互可能不完全生效。',
      parameters: {
        type: 'object',
        properties: {
          sourceSelector: { type: 'string', description: '要拖拽的源元素 CSS 选择器' },
          targetSelector: { type: 'string', description: '拖拽目标元素的 CSS 选择器' }
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
      description: '等待当前标签页完成页面跳转/导航。在点击链接、提交表单后调用此工具，确保新页面加载完毕后再继续操作。',
      parameters: {
        type: 'object',
        properties: {
          timeout: { type: 'integer', description: '超时时间（毫秒），默认 30000', default: 30000 },
          waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: '等待目标：load（完全加载）/domcontentloaded（DOM就绪）/networkidle（网络空闲），默认 load', default: 'load' }
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
      description: '批量填充网页表单，支持输入框、下拉框、复选框、单选框、以及contenteditable富文本编辑器。适用于自动填写表单、登录信息等场景',
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: '字段选择器，如 input[name="username"]'
                },
                value: {
                  type: 'string',
                  description: '填充值'
                },
                fieldType: {
                  type: 'string',
                  description: '字段类型：text（文本输入，自动检测contenteditable富文本编辑器）、select（下拉选择）、checkbox（复选框）、radio（单选框）、contenteditable（显式指定富文本编辑器）',
                  enum: ['text', 'select', 'checkbox', 'radio', 'contenteditable'],
                  default: 'text'
                }
              },
              required: ['selector', 'value']
            },
            description: '表单字段列表'
          },
          waitTime: {
            type: 'integer',
            description: '填充后等待时间（毫秒），默认500ms',
            default: 500
          }
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
      description: '模拟键盘按键或直接输入文本。用于处理快捷键触发、富文本编辑器操作',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: '按键键名，如Enter、Escape、a、Ctrl+S等'
          },
          text: {
            type: 'string',
            description: '直接输入的文本（会追加到当前焦点元素）'
          },
          ctrlKey: {
            type: 'boolean',
            description: '是否同时按下Ctrl键',
            default: false
          },
          shiftKey: {
            type: 'boolean',
            description: '是否同时按下Shift键',
            default: false
          },
          altKey: {
            type: 'boolean',
            description: '是否同时按下Alt键',
            default: false
          }
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
      description: '向文件上传控件（input[type=file]）注入文件。用于自动化测试上传流程',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'input[type=file]的选择器'
          },
          fileName: {
            type: 'string',
            description: '文件名'
          },
          fileContent: {
            type: 'string',
            description: '文件内容（base64编码或普通文本）'
          },
          fileType: {
            type: 'string',
            description: '文件MIME类型，如image/png、text/plain',
            default: 'application/octet-stream'
          }
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
      description: '在下拉菜单中选择指定选项。支持原生 <select> 元素和自定义下拉（div+ul+li）。自动处理：点击触发器 → 等待选项出现 → 文本匹配 → 点击。',
      parameters: {
        type: 'object',
        properties: {
          triggerSelector: { type: 'string', description: '下拉触发器的 CSS 选择器（点击展开选项）' },
          optionText: { type: 'string', description: '要选择的选项文本（支持包含匹配和去空白匹配）' },
          optionSelector: { type: 'string', description: '选项容器选择器（可选，限定选项搜索范围）' },
          timeout: { type: 'integer', description: '等待选项出现的超时（ms），默认 5000', default: 5000 }
        },
        required: ['triggerSelector', 'optionText']
      }
    }
  },
  {
    id: 'get_page_text',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'get_page_text',
      description: '获取当前网页的纯文本内容，用于业务内容读取（抓取数据、提取表格、阅读文章）。只返回文本，不包含HTML标签',
      parameters: {
        type: 'object',
        properties: {
          maxLength: {
            type: 'integer',
            description: '最大字符数，默认15000',
            default: 15000
          },
          includeHeadings: {
            type: 'boolean',
            description: '是否包含标题层级信息',
            default: true
          },
          includeLinks: {
            type: 'boolean',
            description: '是否包含链接列表',
            default: true
          }
        },
        required: []
      }
    }
  },
  {
    id: 'get_full_html',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'get_full_html',
      description: '获取当前网页的完整HTML内容，供给大模型分析页面上有什么按钮、输入框、菜单、样式等，用于规划后续自动化操作',
      parameters: {
        type: 'object',
        properties: {
          includeStyles: {
            type: 'boolean',
            description: '是否包含内联样式',
            default: false
          },
          maxLength: {
            type: 'integer',
            description: '最大字符数，默认50000',
            default: 50000
          }
        },
        required: []
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
      description: '只提取页面可交互元素（推荐优先使用），省Token。直接输出标签-文本-CSS选择器，AI可直接拿来调用click_element/fill_form等工具',
      parameters: {
        type: 'object',
        properties: {
          filterByText: {
            type: 'string',
            description: '按文本内容过滤，如"登录"'
          },
          elementTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['button', 'input', 'select', 'textarea', 'a', 'checkbox', 'radio', 'menuitem']
            },
            description: '筛选特定类型的元素，默认全部'
          },
          maxResults: {
            type: 'integer',
            description: '最大返回数量，默认100',
            default: 100
          }
        },
        required: []
      }
    }
  },
  {
    id: 'get_selected_content',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'get_selected_content',
      description: '获取当前网页用户选中的文本内容或富文本内容',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            description: '返回格式，可选值：text（纯文本，默认）或 html（富文本/HTML）',
            enum: ['text', 'html']
          }
        },
        required: []
      }
    }
  },
  {
    id: 'extract_table',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'extract_table',
      description: '提取网页表格数据为结构化JSON。适用于提取报表、价格表、榜单等表格数据',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '表格选择器，默认table',
            default: 'table'
          },
          includeHeaders: {
            type: 'boolean',
            description: '是否包含表头作为第一行',
            default: true
          },
          format: {
            type: 'string',
            description: '输出格式：json（JSON数组）、markdown（Markdown表格）',
            enum: ['json', 'markdown'],
            default: 'json'
          }
        },
        required: []
      }
    }
  },
  {
    id: 'extract_metadata',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'extract_metadata',
      description: '提取网页元数据，包括标题、描述、关键词、作者、发布时间、Open Graph信息等SEO相关信息',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    id: 'extract_links',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'extract_links',
      description: '提取页面所有链接，可按内链/外链过滤。用于SEO分析、死链检测、批量获取URL',
      parameters: {
        type: 'object',
        properties: {
          filterType: {
            type: 'string',
            description: '过滤类型：all（全部）、internal（仅内链）、external（仅外链）',
            enum: ['all', 'internal', 'external'],
            default: 'all'
          },
          includeImages: {
            type: 'boolean',
            description: '是否包含图片链接',
            default: false
          }
        },
        required: []
      }
    }
  },
  {
    id: 'extract_forms',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'extract_forms',
      description: '识别页面所有表单及其字段结构。用于自动化填表前的结构分析',
      parameters: {
        type: 'object',
        properties: {
          formSelector: {
            type: 'string',
            description: '指定表单选择器（可选，不填则提取所有表单）'
          }
        },
        required: []
      }
    }
  },
  {
    id: 'extract_images',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'extract_images',
      description: '提取页面所有图片URL，支持批量下载和过滤',
      parameters: {
        type: 'object',
        properties: {
          minWidth: {
            type: 'integer',
            description: '最小宽度过滤，默认0',
            default: 0
          },
          minHeight: {
            type: 'integer',
            description: '最小高度过滤，默认0',
            default: 0
          },
          includeBackgroundImages: {
            type: 'boolean',
            description: '是否包含背景图片，默认false',
            default: false
          },
          download: {
            type: 'boolean',
            description: '是否自动下载，默认false',
            default: false
          },
          maxResults: {
            type: 'integer',
            description: '最大返回数量，默认100',
            default: 100
          }
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
      description: '在当前页面搜索文本，支持普通文本和正则表达式两种模式，并可高亮匹配结果。默认使用普通文本模式，效率更高',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词'
          },
          mode: {
            type: 'string',
            enum: ['plain', 'regex'],
            description: '搜索模式：plain（普通文本，默认）、regex（正则表达式）',
            default: 'plain'
          },
          caseSensitive: {
            type: 'boolean',
            description: '是否区分大小写，默认false',
            default: false
          },
          contextLength: {
            type: 'integer',
            description: '上下文长度（字符），默认50',
            default: 50
          },
          maxResults: {
            type: 'integer',
            description: '最大返回匹配数，默认20',
            default: 20
          },
          highlight: {
            type: 'boolean',
            description: '是否高亮显示匹配结果，默认false',
            default: false
          }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'page_to_markdown',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'page_to_markdown',
      description: '将网页内容转换为Markdown格式，用于文档归档和知识库建设',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '目标元素选择器，默认整个body'
          },
          includeImages: {
            type: 'boolean',
            description: '是否包含图片链接，默认true',
            default: true
          },
          includeLinks: {
            type: 'boolean',
            description: '是否保留链接，默认true',
            default: true
          },
          maxLength: {
            type: 'integer',
            description: '最大字符数，默认50000',
            default: 50000
          }
        },
        required: []
      }
    }
  },
  {
    id: 'page_to_json',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'page_to_json',
      description: '将网页结构化数据（表格、列表、JSON-LD、微数据等）提取为结构化 JSON，比 Markdown 更适合 LLM 处理和数据分析',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '限制提取范围的 CSS 选择器，不指定则提取整个页面' },
          maxItems: { type: 'integer', description: '每类数据的最大条数，默认100', default: 100 }
        },
        required: []
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
      description: '给定一个 CSS 选择器，找到页面上结构/样式相似的元素（如找到所有同类商品卡片），适合批量数据提取',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '参考元素的 CSS 选择器' },
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
      description: '获取页面内嵌 iframe 中的文本内容（仅限同源 iframe，跨域会被标记为 inaccessible）',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '限定 iframe 的 CSS 选择器，默认选择所有 iframe', default: 'iframe' },
          includeNested: { type: 'boolean', description: '是否递归获取嵌套 iframe 内容（最大深度2层）', default: false },
          maxLength: { type: 'integer', description: '每个 iframe 最大文本长度', default: 10000 }
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
      description: '自动滚动页面并持续收集文本内容。适用于无限滚动页面（微博、Twitter、商品列表）。每滚动一段距离后提取新增可见文本，去重拼接后返回。',
      parameters: {
        type: 'object',
        properties: {
          scrollPixels: { type: 'integer', description: '每次滚动像素距离，默认 800', default: 800 },
          maxScrolls: { type: 'integer', description: '最大滚动次数，防无限滚动，默认 20', default: 20 },
          pauseMs: { type: 'integer', description: '滚动间暂停时间（ms），等待内容加载，默认 500', default: 500 },
          selector: { type: 'string', description: '限定收集区域的选择器，默认收集整个页面' }
        },
        required: []
      }
    }
  },
  {
    id: 'get_element_count',
    category: 'content_extraction',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'get_element_count',
      description: '快速统计匹配 CSS 选择器的元素数量。比 query_interactive_elements 轻量得多（不返回元素详情），适合快速判断页面状态（如"有几条结果"）。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          includeHidden: { type: 'boolean', description: '是否包含隐藏元素，默认 false', default: false }
        },
        required: ['selector']
      }
    }
  },
];
