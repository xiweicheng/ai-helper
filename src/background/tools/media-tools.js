// media-tools - media output + debug dev 工具定义

export const MEDIA_TOOLS = [
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
];
