// background/constants.js - 默认配置和内置工具定义

// 默认配置
export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-pro';

// ReAct 循环配置默认值
export const DEFAULT_REACT_CONFIG = {
  maxIterations: 5,          // 最大循环次数 (1-20)
  apiTimeout: 60000,          // API 请求超时 (ms) (10000-600000)
  loopTimeout: 300000,        // 整体循环超时 (ms) (60000-1800000)
  toolTimeout: 30000,         // 工具执行超时 (ms) (5000-600000)
  clarifyTimeout: 180000,     // 澄清工具超时 (ms) (60000-600000)，独立配置
  apiRetryCount: 3,           // API 调用失败重试次数 (0-10)
  apiRetryBaseDelay: 1000     // API 重试基础延迟 (ms) (500-30000)，指数退避
};

// 对话配置默认值
export const DEFAULT_CHAT_CONFIG = {
  maxInputHistory: 20,        // 最大输入历史记录数 (10-100)
  maxHistoryMessages: 50,     // 最大保留对话轮数 (10-200)
  maxMessageLength: 5000,     // 单条消息最大字符数 (1000-50000)
  maxMemoryMessages: null     // 记忆历史限制条数，null表示不限制
};

export const BUILTIN_TOOLS = [
  {
    id: 'get_page_text',
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
    id: 'get_element_by_selector',
    type: 'function',
    function: {
      name: 'get_element_by_selector',
      description: '获取指定 CSS 选择器的元素内容',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS 选择器，如 #content, .article, h1 等'
          }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'get_selected_content',
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
    id: 'capture_tab_screenshot',
    type: 'function',
    function: {
      name: 'capture_tab_screenshot',
      description: '截取当前标签页可见区域的截图，截图会自动下载到浏览器默认下载目录',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            description: '图片格式，可选值：jpeg（默认）或 png',
            enum: ['jpeg', 'png'],
            default: 'jpeg'
          },
          quality: {
            type: 'integer',
            description: '图片质量（仅 jpeg 格式有效），范围 0-100，默认为 80',
            default: 80
          }
        },
        required: []
      }
    }
  },
  {
    id: 'clarify_question',
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
    type: 'function',
    function: {
      name: 'scroll_to',
      description: '滚动到指定位置，支持滚动到元素、页面顶部、页面底部或指定坐标。适用于加载更多内容或定位到特定区域',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: '滚动目标：selector（元素选择器）、top（顶部）、bottom（底部）、coordinates（坐标）',
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
    id: 'drag_and_drop',
    type: 'function',
    function: {
      name: 'drag_and_drop',
      description: '模拟拖拽操作（从源元素拖到目标元素）。⚠️ 实验性：受浏览器安全策略限制，手动创建的拖拽事件无法传递真实的 dataTransfer 数据，大多数网页拖拽功能可能无法触发。仅对简单的事件冒泡型拖拽交互可能生效',
      parameters: {
        type: 'object',
        properties: {
          sourceSelector: {
            type: 'string',
            description: '源元素CSS选择器'
          },
          targetSelector: {
            type: 'string',
            description: '目标元素CSS选择器'
          }
        },
        required: ['sourceSelector', 'targetSelector']
      }
    }
  },
  {
    id: 'file_upload',
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
    id: 'scroll_into_view',
    type: 'function',
    function: {
      name: 'scroll_into_view',
      description: '将指定元素滚动到可视区域。确保目标元素可见后再操作，避免click失败',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '目标元素CSS选择器'
          },
          align: {
            type: 'string',
            description: '对齐方式：start（顶部）、center（居中）、end（底部）、nearest（最近）',
            enum: ['start', 'center', 'end', 'nearest'],
            default: 'center'
          },
          smooth: {
            type: 'boolean',
            description: '是否平滑滚动',
            default: true
          }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'extract_links',
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
    id: 'watch_element',
    type: 'function',
    function: {
      name: 'watch_element',
      description: '监听指定DOM元素变化（添加子节点、删除、属性变化）。用于实时捕获动态内容更新',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '目标元素CSS选择器'
          },
          duration: {
            type: 'integer',
            description: '监听持续时间（毫秒），默认30000',
            default: 30000
          }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'manage_storage',
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
    id: 'get_element_rect',
    type: 'function',
    function: {
      name: 'get_element_rect',
      description: '获取元素的位置、尺寸、内边距、外边距信息。用于布局调试、UI自动化坐标计算',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '目标元素CSS选择器'
          }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'get_computed_style',
    type: 'function',
    function: {
      name: 'get_computed_style',
      description: '获取元素的最终计算样式。用于CSS调试、主题色提取',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '目标元素CSS选择器'
          },
          properties: {
            type: 'array',
            items: { type: 'string' },
            description: '要获取的CSS属性列表（可选，不填则返回常用属性）'
          }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'color_picker',
    type: 'function',
    function: {
      name: 'color_picker',
      description: '从页面任意位置取色（基于EyeDropper API）。用于设计还原检查、主题色提取',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    id: 'diff_page',
    type: 'function',
    function: {
      name: 'diff_page',
      description: '对比当前页与上一次快照的差异。用于监控页面变更、回归测试',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '操作：snapshot（保存快照）、compare（对比快照）',
            enum: ['snapshot', 'compare'],
            default: 'snapshot'
          },
          snapshotName: {
            type: 'string',
            description: '快照名称（用于compare时指定要对比的快照）'
          }
        },
        required: []
      }
    }
  },
  {
    id: 'text_to_speech',
    type: 'function',
    function: {
      name: 'text_to_speech',
      description: '将文本转为语音播放（基于Web Speech API）。用于朗读文章、无障碍场景',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '要朗读的文本'
          },
          lang: {
            type: 'string',
            description: '语言，如zh-CN、en-US',
            default: 'zh-CN'
          },
          rate: {
            type: 'number',
            description: '语速（0.1-10），默认1',
            default: 1
          },
          pitch: {
            type: 'number',
            description: '音调（0-2），默认1',
            default: 1
          }
        },
        required: ['text']
      }
    }
  },
  {
    id: 'manage_cookies',
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
    type: 'function',
    function: {
      name: 'search_in_page',
      description: '正则搜索页面文本，返回匹配位置及上下文',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: '搜索模式（支持正则表达式）'
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
        required: ['pattern']
      }
    }
  },
  {
    id: 'video_control',
    type: 'function',
    function: {
      name: 'video_control',
      description: '控制页面视频播放（播放、暂停、快进、音量调节等）',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['play', 'pause', 'toggle', 'stop', 'seek', 'volume', 'mute', 'speed', 'fullscreen'],
            description: '操作类型'
          },
          selector: {
            type: 'string',
            description: '视频元素选择器，默认第一个视频'
          },
          value: {
            type: 'number',
            description: '参数值（seek为时间秒数，volume为0-1，speed为播放速度）'
          }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'generate_qrcode',
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
    id: 'performance_audit',
    type: 'function',
    function: {
      name: 'performance_audit',
      description: '采集页面性能指标（LCP/FCP/CLS等Core Web Vitals）',
      parameters: {
        type: 'object',
        properties: {
          includeResourceTiming: {
            type: 'boolean',
            description: '是否包含资源加载时序，默认false',
            default: false
          },
          includePaintTiming: {
            type: 'boolean',
            description: '是否包含绘制时序，默认true',
            default: true
          },
          includeMemoryInfo: {
            type: 'boolean',
            description: '是否包含内存信息，默认false',
            default: false
          }
        },
        required: []
      }
    }
  },
  {
    id: 'screenshot_element',
    type: 'function',
    function: {
      name: 'screenshot_element',
      description: '对指定元素进行截图，返回Base64图片数据',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '目标元素选择器'
          },
          quality: {
            type: 'number',
            description: '图片质量（0-1），默认0.9',
            default: 0.9
          },
          format: {
            type: 'string',
            enum: ['png', 'jpeg', 'webp'],
            description: '图片格式，默认png',
            default: 'png'
          }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'shadow_dom_query',
    type: 'function',
    function: {
      name: 'shadow_dom_query',
      description: '穿透Shadow DOM查询元素，支持Web Components页面自动化',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS选择器'
          },
          deep: {
            type: 'boolean',
            description: '是否深度遍历所有Shadow DOM，默认true',
            default: true
          },
          maxDepth: {
            type: 'integer',
            description: '最大遍历深度，默认5',
            default: 5
          },
          maxResults: {
            type: 'integer',
            description: '最大返回数量，默认50',
            default: 50
          }
        },
        required: ['selector']
      }
    }
  },
  {
    id: 'schedule_task',
    type: 'function',
    function: {
      name: 'schedule_task',
      description: '创建定时任务（如定时刷新、页面监控）',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'get', 'list', 'clear', 'clearAll'],
            description: '操作类型'
          },
          name: {
            type: 'string',
            description: '任务名称（create/get/clear操作必需）'
          },
          delayInMinutes: {
            type: 'number',
            description: '延迟执行时间（分钟），与periodInMinutes二选一'
          },
          periodInMinutes: {
            type: 'number',
            description: '重复周期（分钟），设置后为周期性任务'
          },
          scheduledTime: {
            type: 'string',
            description: '指定执行时间（ISO 8601格式）'
          },
          taskData: {
            type: 'object',
            description: '任务附带数据，可在触发时获取'
          }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'execute_workflow',
    type: 'function',
    function: {
      name: 'execute_workflow',
      description: '执行预定义的工作流（多步骤自动化编排）',
      parameters: {
        type: 'object',
        properties: {
          workflow: {
            type: 'object',
            description: '工作流定义对象'
          },
          workflowName: {
            type: 'string',
            description: '已保存的工作流名称（与workflow二选一）'
          },
          variables: {
            type: 'object',
            description: '工作流变量（键值对）'
          },
          debug: {
            type: 'boolean',
            description: '是否开启调试模式，输出详细日志',
            default: false
          }
        },
        required: []
      }
    }
  },
  {
    id: 'plan_task',
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
  {
    id: 'manage_user_scripts',
    type: 'function',
    function: {
      name: 'manage_user_scripts',
      description: '管理用户自定义脚本（类似Tampermonkey）',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'get', 'list', 'update', 'delete', 'run'],
            description: '操作类型'
          },
          name: {
            type: 'string',
            description: '脚本名称'
          },
          code: {
            type: 'string',
            description: '脚本代码（create/update操作必需）'
          },
          matchPatterns: {
            type: 'array',
            items: { type: 'string' },
            description: '匹配URL模式列表'
          },
          runAt: {
            type: 'string',
            enum: ['document_start', 'document_end', 'document_idle'],
            description: '脚本注入时机，默认document_idle',
            default: 'document_idle'
          }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'compare_urls',
    type: 'function',
    function: {
      name: 'compare_urls',
      description: '对比两个URL页面的内容差异',
      parameters: {
        type: 'object',
        properties: {
          url1: {
            type: 'string',
            description: '第一个URL'
          },
          url2: {
            type: 'string',
            description: '第二个URL'
          },
          compareTextOnly: {
            type: 'boolean',
            description: '是否仅对比文本内容，默认true',
            default: true
          },
          ignoreWhitespace: {
            type: 'boolean',
            description: '是否忽略空白差异，默认true',
            default: true
          }
        },
        required: ['url1', 'url2']
      }
    }
  },
  {
    id: 'page_to_pdf',
    type: 'function',
    function: {
      name: 'page_to_pdf',
      description: '将当前页面导出为PDF文件',
      parameters: {
        type: 'object',
        properties: {
          fileName: {
            type: 'string',
            description: '输出文件名，默认当前页面标题',
            default: 'page.pdf'
          },
          landscape: {
            type: 'boolean',
            description: '是否横向打印，默认false',
            default: false
          },
          scale: {
            type: 'number',
            description: '缩放比例（0.1-2），默认1',
            default: 1
          },
          printBackground: {
            type: 'boolean',
            description: '是否打印背景，默认true',
            default: true
          },
          margins: {
            type: 'object',
            properties: {
              top: { type: 'string', default: '1cm' },
              right: { type: 'string', default: '1cm' },
              bottom: { type: 'string', default: '1cm' },
              left: { type: 'string', default: '1cm' }
            },
            description: '页边距，如"1cm"或"0.5in"'
          }
        },
        required: []
      }
    }
  },
  // ========== 新增工具 (2026-06-21) ==========
  {
    id: 'page_to_json',
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
    id: 'run_javascript',
    type: 'function',
    function: {
      name: 'run_javascript',
      description: '在页面上下文中执行任意 JavaScript 代码并返回结果。支持异步（Promise）结果。⚠️ 请谨慎使用',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要执行的 JavaScript 代码' },
          timeout: { type: 'integer', description: '异步执行超时毫秒数，默认5000', default: 5000 }
        },
        required: ['code']
      }
    }
  },
  {
    id: 'inject_css',
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
    id: 'find_text_on_page',
    type: 'function',
    function: {
      name: 'find_text_on_page',
      description: '使用浏览器原生查找功能搜索页面文本，比 DOM 搜索更高效，并能高亮匹配结果',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          caseSensitive: { type: 'boolean', description: '是否区分大小写', default: false },
          highlight: { type: 'boolean', description: '是否高亮搜索结果', default: true }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'get_page_language',
    type: 'function',
    function: {
      name: 'get_page_language',
      description: '检测当前网页的语言设置，返回 HTML lang 属性、meta 标签和浏览器语言信息',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    id: 'read_accessibility_tree',
    type: 'function',
    function: {
      name: 'read_accessibility_tree',
      description: '获取页面无障碍树信息，收集带有 ARIA 属性、语义化 role 的元素，对复杂 SPA 应用的页面结构理解很有帮助',
      parameters: {
        type: 'object',
        properties: {
          maxResults: { type: 'integer', description: '最大返回元素数，默认100', default: 100 }
        },
        required: []
      }
    }
  },
  {
    id: 'set_zoom',
    type: 'function',
    function: {
      name: 'set_zoom',
      description: '控制当前页面的缩放级别，支持数值缩放（0.5-3.0）、步进缩放（in/out）和重置（reset）',
      parameters: {
        type: 'object',
        properties: {
          level: { type: 'string', description: '缩放级别：数字字符串如"1.5"、"0.75"，或"in"/"out"/"reset"' }
        },
        required: ['level']
      }
    }
  },
  {
    id: 'clear_page_data',
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
    id: 'resize_window',
    type: 'function',
    function: {
      name: 'resize_window',
      description: '调整浏览器窗口大小，适合响应式页面测试。不指定尺寸则返回当前窗口尺寸',
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'integer', description: '窗口宽度（像素）' },
          height: { type: 'integer', description: '窗口高度（像素）' }
        },
        required: []
      }
    }
  },
  {
    id: 'navigate_back_forward',
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
    id: 'mute_tab',
    type: 'function',
    function: {
      name: 'mute_tab',
      description: '静音或取消静音指定标签页',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页 ID，不指定则操作当前标签页' },
          muted: { type: 'boolean', description: 'true 静音，false 取消静音' }
        },
        required: ['muted']
      }
    }
  },
  {
    id: 'pin_tab',
    type: 'function',
    function: {
      name: 'pin_tab',
      description: '固定或取消固定指定标签页（固定标签页会缩小并固定在标签栏左侧）',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页 ID，不指定则操作当前标签页' },
          pinned: { type: 'boolean', description: 'true 固定，false 取消固定' }
        },
        required: ['pinned']
      }
    }
  },
  {
    id: 'group_tabs',
    type: 'function',
    function: {
      name: 'group_tabs',
      description: '创建标签页分组并设置分组标题和颜色，适用于 Chrome 标签页管理',
      parameters: {
        type: 'object',
        properties: {
          tabIds: { type: 'array', items: { type: 'integer' }, description: '要分组的标签页 ID 数组，至少需要 1 个' },
          title: { type: 'string', description: '分组名称' },
          color: { type: 'string', enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'], description: '分组颜色' }
        },
        required: ['tabIds']
      }
    }
  },
  {
    id: 'record_network',
    type: 'function',
    function: {
      name: 'record_network',
      description: '录制或停止录制当前标签页的网络请求，方便分析页面加载行为',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'stop', 'status'], description: '操作：start（开始录制）、stop（停止并返回结果）、status（查看录制状态）' }
        },
        required: ['action']
      }
    }
  }
];

// ==================== 工具类别映射（单一数据源） ====================
export const TOOL_CATEGORY_MAP = {
  click_element: 'page_interaction',
  hover_element: 'page_interaction',
  drag_and_drop: 'page_interaction',
  fill_form: 'form_operation',
  keyboard_input: 'form_operation',
  file_upload: 'form_operation',
  get_page_text: 'info_extract',
  get_selected_content: 'info_extract',
  extract_metadata: 'info_extract',
  search_in_page: 'info_extract',
  get_full_html: 'page_analysis',
  query_interactive_elements: 'page_analysis',
  get_element_by_selector: 'page_analysis',
  extract_table: 'page_analysis',
  extract_links: 'page_analysis',
  extract_forms: 'page_analysis',
  extract_images: 'page_analysis',
  get_element_rect: 'page_analysis',
  get_computed_style: 'page_analysis',
  page_to_markdown: 'page_analysis',
  open_tab: 'tab_management',
  switch_tab: 'tab_management',
  close_tab: 'tab_management',
  get_tabs: 'tab_management',
  search_bookmarks: 'bookmark_history',
  search_history: 'bookmark_history',
  manage_cookies: 'storage_management',
  manage_storage: 'storage_management',
  fetch_url: 'network_request',
  compare_urls: 'network_request',
  capture_tab_screenshot: 'media_process',
  screenshot_element: 'media_process',
  page_to_pdf: 'media_process',
  text_to_speech: 'media_process',
  video_control: 'media_process',
  generate_qrcode: 'media_process',
  diff_page: 'debug_dev',
  performance_audit: 'debug_dev',
  shadow_dom_query: 'debug_dev',
  color_picker: 'debug_dev',
  clarify_question: 'ai_collaboration',
  highlight_text: 'ai_collaboration',
  schedule_task: 'ai_collaboration',
  execute_workflow: 'ai_collaboration',
  manage_user_scripts: 'ai_collaboration',
  plan_task: 'ai_collaboration',
  copy_to_clipboard: 'system_integration',
  paste_from_clipboard: 'system_integration',
  show_notification: 'system_integration',
  download_file: 'system_integration',
  get_browser_info: 'system_integration',
  scroll_to: 'system_integration',
  scroll_into_view: 'system_integration',
  wait_for_element: 'system_integration',
  watch_element: 'system_integration',
  page_to_json: 'page_analysis',
  find_similar_elements: 'page_analysis',
  get_iframe_content: 'page_analysis',
  run_javascript: 'debug_dev',
  inject_css: 'debug_dev',
  find_text_on_page: 'info_extract',
  get_page_language: 'info_extract',
  read_accessibility_tree: 'info_extract',
  set_zoom: 'page_interaction',
  clear_page_data: 'storage_management',
  resize_window: 'system_integration',
  navigate_back_forward: 'tab_management',
  reload_tab: 'tab_management',
  mute_tab: 'tab_management',
  pin_tab: 'tab_management',
  group_tabs: 'tab_management',
  record_network: 'debug_dev',
};

/**
 * 从 OpenAI Function Calling 格式的 BUILTIN_TOOLS 派生 UI 格式
 */
export const BUILTIN_TOOLS_UI = BUILTIN_TOOLS.map(t => ({
  id: t.id,
  name: t.function.name,
  description: t.function.description,
  category: TOOL_CATEGORY_MAP[t.id] || 'system_integration',
  enabled: true
}));
