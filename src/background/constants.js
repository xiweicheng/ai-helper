// background/constants.js - 默认配置和内置工具定义

// 默认配置
export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-pro';

// ReAct 循环配置默认值
export const DEFAULT_REACT_CONFIG = {
  maxIterations: 5,          // 最大循环次数 (1-20)
  apiTimeout: 60000,          // API 请求超时 (ms) (10000-600000)
  loopTimeout: 300000,        // 整体循环超时 (ms) (60000-3600000)
  toolTimeout: 30000,         // 工具执行超时 (ms) (5000-600000)
  clarifyTimeout: 180000,     // 澄清工具超时 (ms) (60000-600000)，独立配置
  apiRetryCount: 3,           // API 调用失败重试次数 (0-10)
  apiRetryBaseDelay: 1000,    // API 重试基础延迟 (ms) (500-30000)，指数退避
  enableToolPreselect: true,  // 是否启用工具预筛选（默认开启）
  preselectMinToolCount: 3,   // 工具预筛选最小触发数量（工具数超过此值才启动预筛选）
  toolConfirmationEnabled: true  // 是否启用敏感工具操作确认（关闭后敏感工具直接放行）
};

// 反思配置默认值
export const DEFAULT_REFLECTION_CONFIG = {
  enabled: true,              // 是否启用反思（可整体关闭）
  postReflection: {
    enabled: true,            // 主循环后置反思
    maxRounds: 1,             // 最大反思轮数（0=不反思）
    qualityThreshold: 7,      // 质量评分阈值（1-10），低于此值重新执行
    refineThreshold: 5,       // 修订阈值（1-10），低于此值直接修订而非重新执行
    model: null,              // 反思用模型，null=使用当前模型
    temperature: 0.3,         // 反思时 temperature
    maxTokens: 2048           // 反思响应最大 token
  },
  subtaskReflection: {
    enabled: false,           // 子任务反思（默认关闭）
    onlyForComplexSubtasks: true, // 仅标记为 complex 的子任务
    maxRounds: 1,
    dimensions: ['completeness', 'relevance'], // 简化维度
    model: null,
    temperature: 0.3,
    maxTokens: 1024
  },
  toolReflection: {
    enabled: true,            // 工具级反思
    triggerOnError: true,     // 工具返回错误时触发
    triggerOnEmpty: true,     // 工具返回空结果时触发
    triggerOnOversized: true, // 工具返回结果过大时触发
    oversizeThreshold: 50000, // 结果大小阈值（字符）
    triggerOnConsecutiveFails: 3, // 连续 N 次工具失败触发
    maxPerIteration: 2        // 每轮迭代最多触发工具反思次数
  }
};

// 流式输出配置默认值
export const DEFAULT_STREAM_CONFIG = {
  streamEnabled: true,           // LLM 流式输出默认开启
  streamChunkDelay: 30,          // Side Panel 渲染字符间延迟 (ms)，0=瞬间渲染
  agentStreamEnabled: true       // Agent 命令流式输出默认开启
};

// 对话配置默认值
export const DEFAULT_CHAT_CONFIG = {
  maxInputHistory: 20,        // 最大输入历史记录数 (10-100)
  maxHistoryMessages: 50,     // 最大保留对话轮数 (10-200)
  maxMessageLength: 100000,   // 单条消息最大字符数（仅作上限参考，不再截断存储）
  maxMemoryMessages: 20,      // 记忆历史限制条数，默认20条
  contextWindow: 0            // 上下文窗口大小（tokens），0=自动根据模型名推断
};

export const RAW_TOOLS = [
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
    id: 'search_bookmarks',
    category: 'bookmark_history',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_bookmarks',
      description: '搜索浏览器书签，可以通过关键词搜索书签。如果不知道具体关键词，可以先搜索空或常用词来获取相关书签列表',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，用于匹配书签标题和URL。可以为空字符串来获取所有书签或最近添加的书签'
          },
          maxResults: {
            type: 'integer',
            description: '返回的最大结果数量，默认为10',
            default: 10
          }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'search_history',
    category: 'bookmark_history',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_history',
      description: '搜索浏览器访问历史记录，可以通过关键词搜索之前访问过的网页',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，用于匹配访问记录的标题和URL'
          },
          maxResults: {
            type: 'integer',
            description: '返回的最大结果数量，默认为10',
            default: 10
          },
          startTime: {
            type: 'integer',
            description: '开始时间，Unix 时间戳（毫秒），可选。用于限制搜索范围'
          },
          endTime: {
            type: 'integer',
            description: '结束时间，Unix 时间戳（毫秒），可选。用于限制搜索范围'
          }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'clarify_question',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'clarify_question',
      description: '当需要进一步澄清用户的问题或任务时调用此工具。该工具会弹出界面让用户从3-5个建议选项中选择，或自定义输入内容，并支持补充说明。适用于信息不完整、存在歧义或需要确认细节的场景',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '需要澄清的问题或主题'
          },
          options: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: '3-5个供用户选择的建议选项'
          },
          recommendedOption: {
            type: 'integer',
            description: '模型推荐优先选择的选项索引（从0开始），该选项会被标记为推荐并默认选中，必填'
          },
          allowCustomInput: {
            type: 'boolean',
            description: '是否允许用户自定义输入（默认true）',
            default: true
          },
          allowAdditionalInfo: {
            type: 'boolean',
            description: '是否允许用户提供补充信息（默认true）',
            default: true
          }
        },
        required: ['question', 'options', 'recommendedOption']
      }
    }
  },
  {
    id: 'show_notification',
    category: 'media_output',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'show_notification',
      description: '显示浏览器桌面通知或播放提示音。适用于需要及时提醒用户、通知任务完成或重要事件的场景',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '通知标题，显示在通知的顶部'
          },
          message: {
            type: 'string',
            description: '通知内容，显示在标题下方'
          },
          icon: {
            type: 'string',
            description: '通知图标URL，用于自定义通知图标显示'
          },
          silent: {
            type: 'boolean',
            description: '是否静音通知（不播放系统提示音），默认false',
            default: false
          },
          requireInteraction: {
            type: 'boolean',
            description: '是否需要用户手动关闭通知，默认false（自动关闭）',
            default: false
          },
          playSound: {
            type: 'boolean',
            description: '是否播放提示音（使用Web Audio API），默认false',
            default: false
          },
          soundType: {
            type: 'string',
            description: '提示音类型，可选值：default（默认提示音）、success（成功提示音）、warning（警告提示音）、error（错误提示音）',
            enum: ['default', 'success', 'warning', 'error'],
            default: 'default'
          }
        },
        required: ['title', 'message']
      }
    }
  },
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
    id: 'copy_to_clipboard',
    category: 'media_output',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'copy_to_clipboard',
      description: '将文本复制到剪贴板。适用于复制大模型生成的结果或提取的网页内容',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '要复制的文本内容'
          }
        },
        required: ['text']
      }
    }
  },
  {
    id: 'paste_from_clipboard',
    category: 'media_output',
    execution: 'content_script',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'paste_from_clipboard',
      description: '从剪贴板读取文本内容。适用于将剪贴板内容发送给大模型处理',
      parameters: {
        type: 'object',
        properties: {}
      },
      required: []
    }
  },
  {
    id: 'fetch_url',
    category: 'network_request',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'fetch_url',
      description: '发起HTTP请求获取数据，支持GET/POST方法。适用于获取接口数据、下载页面内容、调用第三方API',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '请求URL'
          },
          method: {
            type: 'string',
            description: 'HTTP方法：GET、POST',
            enum: ['GET', 'POST'],
            default: 'GET'
          },
          headers: {
            type: 'object',
            description: '请求头，如 {"Content-Type": "application/json"}'
          },
          body: {
            type: 'string',
            description: 'POST请求体（JSON字符串）'
          },
          timeout: {
            type: 'integer',
            description: '请求超时时间（毫秒），默认30000ms',
            default: 30000
          }
        },
        required: ['url']
      }
    }
  },
  {
    id: 'open_tab',
    category: 'tab_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'open_tab',
      description: '打开新的浏览器标签页。适用于在新标签页中打开链接或网页',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要打开的URL'
          },
          active: {
            type: 'boolean',
            description: '是否激活新标签页，默认true',
            default: true
          }
        },
        required: ['url']
      }
    }
  },
  {
    id: 'switch_tab',
    category: 'tab_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'switch_tab',
      description: '切换到指定的标签页。适用于在多个标签页之间切换',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'integer',
            description: '目标标签页ID'
          }
        },
        required: ['tabId']
      }
    }
  },
  {
    id: 'close_tab',
    category: 'tab_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'close_tab',
      description: '关闭指定的标签页。适用于关闭不需要的标签页',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'integer',
            description: '要关闭的标签页ID，不填则关闭当前标签页'
          }
        },
        required: []
      }
    }
  },
  {
    id: 'get_tabs',
    category: 'tab_management',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'get_tabs',
      description: '获取当前窗口的所有标签页列表。适用于获取所有打开的标签页信息',
      parameters: {
        type: 'object',
        properties: {
          includeUrl: {
            type: 'boolean',
            description: '是否包含URL信息',
            default: true
          },
          includeTitle: {
            type: 'boolean',
            description: '是否包含标题信息',
            default: true
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
    id: 'download_file',
    category: 'media_output',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'download_file',
      description: '下载指定URL的文件到本地（浏览器下载目录）',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要下载的文件URL'
          },
          filename: {
            type: 'string',
            description: '保存的文件名（可选，默认使用URL中的文件名）'
          }
        },
        required: ['url']
      }
    }
  },
  {
    id: 'get_browser_info',
    category: 'debug_dev',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'get_browser_info',
      description: '获取浏览器和系统环境信息，包括浏览器版本、设备类型、操作系统、语言、主题模式等',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    id: 'highlight_text',
    category: 'ai_collaboration',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'highlight_text',
      description: '在页面上高亮显示指定文本。用于AI回答后定位原文、标记重要内容',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '要高亮的文本内容'
          },
          color: {
            type: 'string',
            description: '高亮颜色，支持颜色名或hex值',
            default: 'yellow'
          }
        },
        required: ['text']
      }
    }
  },
  // ========== 新增工具 ==========
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
    id: 'manage_storage',
    category: 'storage_management',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'manage_storage',
      description: '读写localStorage或sessionStorage。用于调试前端状态、注入/导出缓存数据',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '操作类型：get（读取）、set（写入）、remove（删除）、clear（清空）',
            enum: ['get', 'set', 'remove', 'clear'],
            default: 'get'
          },
          storage: {
            type: 'string',
            description: '存储类型：local（localStorage）、session（sessionStorage）',
            enum: ['local', 'session'],
            default: 'local'
          },
          key: {
            type: 'string',
            description: '键名'
          },
          value: {
            type: 'string',
            description: '值（set操作时必需）'
          }
        },
        required: ['action', 'storage']
      }
    }
  },
{
    id: 'manage_cookies',
    category: 'storage_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'manage_cookies',
      description: '读取、设置、删除浏览器Cookie，支持登录态管理和跨域调试',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'set', 'remove', 'list'],
            description: '操作类型：get(获取单个)、set(设置)、remove(删除)、list(列出所有)'
          },
          name: {
            type: 'string',
            description: 'Cookie名称（get/set/remove操作必需）'
          },
          value: {
            type: 'string',
            description: 'Cookie值（set操作必需）'
          },
          domain: {
            type: 'string',
            description: 'Cookie所属域名，默认当前域名'
          },
          path: {
            type: 'string',
            description: 'Cookie路径，默认"/"'
          },
          secure: {
            type: 'boolean',
            description: '是否仅在HTTPS下发送，默认false',
            default: false
          },
          httpOnly: {
            type: 'boolean',
            description: '是否为HttpOnly，默认false',
            default: false
          },
          expirationDate: {
            type: 'number',
            description: '过期时间（Unix时间戳，秒），不设置则为会话Cookie'
          }
        },
        required: ['action']
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
    id: 'generate_qrcode',
    category: 'media_output',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'generate_qrcode',
      description: '生成指定内容的二维码图片',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '二维码内容，默认当前页面URL'
          },
          size: {
            type: 'integer',
            description: '二维码尺寸（像素），默认200',
            default: 200
          },
          errorCorrection: {
            type: 'string',
            enum: ['L', 'M', 'Q', 'H'],
            description: '容错级别，默认M',
            default: 'M'
          },
          showImage: {
            type: 'boolean',
            description: '是否在页面显示二维码，默认true',
            default: true
          }
        },
        required: []
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
    id: 'plan_task',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'plan_task',
      description: '任务规划与拆解工具。当遇到复杂任务时，先调用此工具进行任务拆解，将大任务分解为多个独立的子任务，并为每个子任务筛选所需的工具集。',
      parameters: {
        type: 'object',
        properties: {
          taskDescription: {
            type: 'string',
            description: '原始任务描述'
          },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: '子任务ID'
                },
                name: {
                  type: 'string',
                  description: '子任务名称'
                },
                description: {
                  type: 'string',
                  description: '子任务详细描述'
                },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '依赖的前置子任务ID列表'
                },
                requiredTools: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '此子任务需要的工具名称列表（如：get_page_text, click_element, fill_form 等）。必须明确指定，否则子任务将无法使用任何工具。'
                },
                estimatedSteps: {
                  type: 'integer',
                  description: '预估需要的步骤数'
                }
              },
              required: ['id', 'name', 'description', 'requiredTools']
            },
            description: '拆解后的子任务列表'
          },
          isComplex: {
            type: 'boolean',
            description: '是否为复杂任务（需要拆解）',
            default: true
          },
          strategy: {
            type: 'string',
            description: '执行策略：sequential（顺序执行）、parallel（并行执行）、conditional（条件执行）',
            enum: ['sequential', 'parallel', 'conditional'],
            default: 'sequential'
          }
        },
        required: ['taskDescription', 'subtasks']
      }
    }
  },
  // ========== 新增工具 (2026-06-21) ==========
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
    id: 'inject_css',
    category: 'debug_dev',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'inject_css',
      description: '向页面注入自定义 CSS 样式，可用于临时调整页面外观、调试样式问题、隐藏干扰元素等',
      parameters: {
        type: 'object',
        properties: {
          css: { type: 'string', description: 'CSS 样式代码' },
          targetSelector: { type: 'string', description: '限定 CSS 应用范围的元素选择器，不指定则全页面应用' },
          injectMode: { type: 'string', enum: ['style', 'inline'], description: '注入模式：style（创建style标签）或inline（逐元素设置内联样式）', default: 'style' }
        },
        required: ['css']
      }
    }
  },
{
    id: 'clear_page_data',
    category: 'storage_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'clear_page_data',
      description: '一键清除当前站点的 localStorage、sessionStorage、Cookie 和缓存数据，方便调试',
      parameters: {
        type: 'object',
        properties: {
          site: { type: 'string', description: '指定要清除的站点（URL 模式），不指定则清除当前标签页站点' }
        },
        required: []
      }
    }
  },
  {
    id: 'navigate_back_forward',
    category: 'tab_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'navigate_back_forward',
      description: '在当前标签页执行前进或后退导航',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['back', 'forward'], description: '导航方向：back（后退）或 forward（前进）', default: 'back' }
        },
        required: []
      }
    }
  },
  {
    id: 'reload_tab',
    category: 'tab_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'reload_tab',
      description: '刷新当前标签页或指定标签页，支持强制刷新（跳过缓存）',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页 ID，不指定则刷新当前活动标签页' },
          bypassCache: { type: 'boolean', description: '是否跳过缓存强制刷新', default: false }
        },
        required: []
      }
    }
  },
{
    id: 'search_conversation_memory',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_conversation_memory',
      description: '搜索之前的对话记录。当你需要回顾用户之前提到过的信息、之前的决策、或者用户说"之前聊过""上次说的""记得之前"等内容时，应主动调用此工具检索相关上下文。当用户的问题涉及之前讨论过的内容、你需要回顾历史上下文才能准确回答时，也请使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或自然语言描述，用于匹配历史对话内容。可以是具体的关键词，也可以是语义描述'
          },
          maxResults: {
            type: 'integer',
            description: '最多返回多少条相关消息，默认为5',
            default: 5
          },
          searchScope: {
            type: 'string',
            description: '搜索范围：current_session（仅当前会话）或 all_sessions（所有历史会话），默认 current_session',
            enum: ['current_session', 'all_sessions']
          }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'preview_ui_prototype',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'preview_ui_prototype',
      description: 'UI 原型预览和管理工具。action=preview：传入HTML代码创建并预览原型，返回prototypeId；action=get：根据prototypeId获取之前创建的原型完整代码，用于修改后再预览。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['preview', 'get'],
            description: '操作类型：preview（创建并预览原型，默认）、get（根据 prototypeId 获取原型代码）',
            default: 'preview'
          },
          html: {
            type: 'string',
            description: '完整的 HTML 代码（包含内联的 CSS 和 JS），仅 action=preview 时需要'
          },
          title: {
            type: 'string',
            description: '原型的标题/名称，仅 action=preview 时需要'
          },
          description: {
            type: 'string',
            description: '原型的简要说明，可选'
          },
          prototypeId: {
            type: 'string',
            description: '原型 ID，格式为 proto_xxxxxxxxxxxxx，仅 action=get 时需要'
          }
        },
        required: ['action']
      }
    }
  },
  // ========== 本地 Agent 工具 ==========
  {
    id: 'agent_read_file',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_read_file',
      description: '通过本地 Agent 读取本地文件系统的文件内容。需要先在设置中完成 Agent 配对，确保代理服务正在运行。只能读取 Agent 工作目录及其白名单目录内的文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径或相对于工作目录的路径'
          }
        },
        required: ['path']
      }
    }
  },
  {
    id: 'agent_write_file',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_write_file',
      description: '通过本地 Agent 将内容写入本地文件系统的文件。会覆盖已有文件或创建新文件。需要先配对 Agent，只能写入 Agent 工作目录及其白名单目录内的文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径或相对于工作目录的路径'
          },
          content: {
            type: 'string',
            description: '要写入的文件内容'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    id: 'agent_list_dir',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_list_dir',
      description: '通过本地 Agent 列出本地文件系统目录的内容（文件和子目录）。需要先配对 Agent。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目录的绝对路径或相对于工作目录的路径，默认为当前工作目录',
            default: '.'
          }
        },
        required: []
      }
    }
  },
  {
    id: 'agent_delete_file',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'agent_delete_file',
      description: '通过本地 Agent 删除本地文件系统的文件或目录。需要先配对 Agent。这是不可逆操作，删除的文件无法从回收站恢复。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要删除的文件或目录路径'
          }
        },
        required: ['path']
      }
    }
  },
  {
    id: 'agent_exec_command',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'agent_exec_command',
      description: '通过本地 Agent 执行系统命令。适用场景：npm install、git 操作、运行脚本、编译构建等。危险命令（如 rm -rf /）会被自动拦截。敏感命令（如 sudo、全局安装 npm 包、chmod 777、git push --force 等）初次调用时会返回确认提示，你需要告知用户需要确认的原因，等待用户同意后，再次调用此工具并传入 force: true 来强制执行。命令的输出和退出码会完整返回。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的系统命令，如 "npm install", "git status", "ls -la" 等'
          },
          cwd: {
            type: 'string',
            description: '命令执行的工作目录（可选），默认为 Agent 的工作目录'
          },
          force: {
            type: 'boolean',
            description: '设为 true 强制执行已被用户确认的命令。仅在用户明确同意执行后再使用。默认为 false。'
          }
        },
        required: ['command']
      }
    }
  },
  {
    id: 'agent_search_files',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_search_files',
      description: '通过本地 Agent 按文件名模式搜索文件。支持 glob 模式（如 "*.js"、"test*.ts"）。优先使用 fd 命令（如已安装），否则使用 Node.js 原生递归搜索。自动跳过 node_modules、.git 等目录。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '搜索根目录路径'
          },
          pattern: {
            type: 'string',
            description: '文件名匹配模式，支持 glob，如 "*.js"、"test*.ts"、"*.{json,md}"。默认为 "*" (匹配所有文件)'
          },
          recursive: {
            type: 'boolean',
            description: '是否递归搜索子目录，默认 true'
          },
          maxResults: {
            type: 'integer',
            description: '最大返回结果数，默认 200'
          }
        },
        required: ['path']
      }
    }
  },
  {
    id: 'agent_search_content',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_search_content',
      description: '通过本地 Agent 在文件中搜索文本内容。优先使用 ripgrep (rg) 命令（如已安装），否则使用 Node.js 原生搜索。自动跳过 node_modules、.git、二进制文件等。返回匹配行及上下文。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '搜索根目录路径'
          },
          pattern: {
            type: 'string',
            description: '要搜索的文本内容（纯文本匹配，非正则）'
          },
          filePattern: {
            type: 'string',
            description: '可选：限制搜索的文件类型，如 "*.js"、"*.{ts,tsx}"。不传则搜索所有文本文件'
          },
          caseSensitive: {
            type: 'boolean',
            description: '是否大小写敏感，默认 false（不区分大小写）'
          },
          maxResults: {
            type: 'integer',
            description: '最大返回结果数，默认 100'
          },
          contextLines: {
            type: 'integer',
            description: '每条匹配结果附带的上下文行数，默认 2'
          }
        },
        required: ['path', 'pattern']
      }
    }
  },
  // ========== P0/P1 新增工具 (2026-06-28) ==========
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
  {
    id: 'take_full_page_screenshot',
    category: 'media_output',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'take_full_page_screenshot',
      description: '对当前标签页进行完整页面截图（包括滚动区域外的内容）。优先使用 DevTools 协议获取全页，失败时回退到可视区截图。返回 Base64 图片数据。',
      parameters: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['png', 'jpeg'], description: '图片格式，默认 png', default: 'png' },
          quality: { type: 'integer', description: 'JPEG 质量（1-100），仅 jpeg 生效，默认 80', default: 80 }
        },
        required: []
      }
    }
  },
  {
    id: 'capture_page',
    category: 'media_output',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'capture_page',
      description: '截取指定标签页（或当前激活标签页）的可见区域截图。支持三种操作模式：download（截图下载到本地）、analyze（截图后AI视觉分析页面内容）、both（下载并分析）',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['download', 'analyze', 'both'],
            description: '操作模式：download=截图下载到本地，analyze=截图后AI视觉分析页面内容，both=下载并分析。默认 both',
            default: 'both'
          },
          tabId: {
            type: 'integer',
            description: '目标标签页的 ID。可通过 get_tabs 工具获取所有标签页列表。仅 analyze/both 模式需要指定。不传则使用当前激活的标签页'
          },
          format: {
            type: 'string',
            enum: ['jpeg', 'png'],
            description: '截图格式，jpeg 更小更快，png 无损但更大。默认 jpeg',
            default: 'jpeg'
          },
          quality: {
            type: 'integer',
            description: '截图 JPEG 压缩质量 0-100，默认 60',
            default: 60
          },
          visionMaxDim: {
            type: 'integer',
            description: '发给视觉 API 的图片最大长边像素（仅 analyze/both 模式有效）。默认 1024，降低可加速但丢失细节，最高不超过 2048。需要看细节时设为 1536 或 2048',
            default: 1024,
            minimum: 512,
            maximum: 2048
          },
          visionQuality: {
            type: 'integer',
            description: '发给视觉 API 的图片 JPEG 压缩质量（仅 analyze/both 模式有效）。默认 65，越低越快但越模糊。需要高清晰度时设为 80-90',
            default: 65,
            minimum: 30,
            maximum: 95
          }
        },
        required: []
      }
    }
  },
  {
    id: 'dispatch_sub_agent',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'dispatch_sub_agent',
      description: '将子任务分派给指定的子 Agent 执行。子 Agent 拥有独立的角色定义和工具集。当你需要不同领域的专业能力处理子任务时使用此工具（如代码审查+文档撰写）。可在一次响应中并行调用多个 dispatch_sub_agent，每个子 Agent 独立执行。',
      parameters: {
        type: 'object',
        properties: {
          subAgentId: {
            type: 'string',
            description: '子 Agent 的 ID。可用的子 Agent 列表会在系统提示词中提供。'
          },
          task: {
            type: 'string',
            description: '要分派给子 Agent 的完整任务描述，包括所有必要的上下文信息。子 Agent 只会看到这个任务描述和其自身的系统提示词，无法访问主对话历史。请确保任务描述足够详细完整。'
          }
        },
        required: ['subAgentId', 'task']
      }
    }
  },
  {
    id: 'skill_run',
    category: 'mcp',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'skill_run',
      description: '执行一个预定义的 Skill（技能）。Skill 是封装了多步操作的可复用流程。可用的 Skill 列表会在系统提示词中提供。\n\n使用示例：\n- 创建 React 组件模板\n- 执行标准化 Git 提交流程\n- 批量处理文件操作',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Skill 名称。例如: create-react-component, git-conventional-commit'
          },
          params: {
            type: 'object',
            description: 'Skill 所需的参数对象。具体参数取决于 Skill 定义。'
          }
        },
        required: ['name']
      }
    }
  },
];

// ==================== 工具类别映射（单一数据源） ====================

// 类别权重：用于确定分类显示顺序（数字越小越靠前）
export const CATEGORY_WEIGHT = {
  page_interaction: 1,
  form_operation: 2,
  content_extraction: 3,
  tab_management: 4,
  bookmark_history: 5,
  storage_management: 6,
  network_request: 7,
  media_output: 8,
  debug_dev: 9,
  ai_collaboration: 10,
  local_agent: 11,
  mcp: 12,
};

// 从 RAW_TOOLS 动态派生分类顺序列表（单一数据源，无需手动维护）
export const CATEGORY_ORDER = [...new Set(RAW_TOOLS.map(t => t.category))]
  .sort((a, b) => (CATEGORY_WEIGHT[a] || 99) - (CATEGORY_WEIGHT[b] || 99));

// 从 RAW_TOOLS 自动派生所有映射表
export const BUILTIN_TOOLS = RAW_TOOLS.map(t => ({ id: t.id, type: t.type, function: t.function }));
export const TOOL_CATEGORY_MAP = Object.fromEntries(RAW_TOOLS.map(t => [t.id, t.category]));
export const TOOL_EXECUTION_MAP = Object.fromEntries(RAW_TOOLS.map(t => [t.id, t.execution]));
export const PARALLELIZABLE_TOOLS = new Set(RAW_TOOLS.filter(t => t.parallelizable).map(t => t.id));
export const CONFIRMATION_REQUIRED_TOOLS = new Set(RAW_TOOLS.filter(t => t.requiresConfirmation).map(t => t.id));
export const BUILTIN_TOOLS_UI = RAW_TOOLS.map(t => ({
  id: t.id, name: t.function.name, description: t.function.description,
  category: t.category, execution: t.execution,
  parallelizable: t.parallelizable, requiresConfirmation: t.requiresConfirmation,
  enabled: true
}));
