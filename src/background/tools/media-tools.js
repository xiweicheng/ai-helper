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
      description: '显示桌面通知或播放提示音',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '通知标题' },
          message: { type: 'string', description: '通知内容' },
          icon: { type: 'string', description: '通知图标URL' },
          silent: { type: 'boolean', description: '静音', default: false },
          requireInteraction: { type: 'boolean', description: '需用户手动关闭', default: false },
          playSound: { type: 'boolean', description: '播放提示音', default: false },
          soundType: { type: 'string', enum: ['default', 'success', 'warning', 'error'], description: '提示音类型', default: 'default' }
        },
        required: ['title', 'message']
      }
    }
  },
  // ── 合并后的剪贴板工具 ──
  {
    id: 'clipboard',
    category: 'media_output',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'clipboard',
      description: '剪贴板操作（复制/粘贴/获取页面选中文本）',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['copy', 'paste', 'get_selected'], description: '操作：copy=复制文本，paste=读取剪贴板，get_selected=获取页面选中文本' },
          text: { type: 'string', description: '要复制的文本（仅action=copy时需要）' },
          format: { type: 'string', enum: ['text', 'html'], description: '选中文本格式（仅action=get_selected时），默认text', default: 'text' }
        },
        required: ['action']
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
      description: '下载文件到本地',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '文件URL' },
          filename: { type: 'string', description: '保存文件名（可选）' }
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
      description: '生成二维码图片',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '二维码内容' },
          size: { type: 'integer', description: '尺寸（像素），默认200', default: 200 },
          errorCorrection: { type: 'string', enum: ['L', 'M', 'Q', 'H'], description: '容错级别', default: 'M' },
          showImage: { type: 'boolean', description: '页面内显示', default: true }
        },
        required: []
      }
    }
  },
  // ── 合并后的截图工具（全页+可视区）──
  {
    id: 'capture_page',
    category: 'media_output',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'capture_page',
      description: '页面截图（支持下载/视觉分析）',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['download', 'analyze', 'both'], description: '操作模式：download=下载，analyze=视觉分析，both=下载+分析', default: 'both' },
          tabId: { type: 'integer', description: '目标标签页ID（analyze/both模式）' },
          format: { type: 'string', enum: ['jpeg', 'png'], description: '截图格式', default: 'jpeg' },
          quality: { type: 'integer', description: 'JPEG质量0-100，默认60', default: 60 },
          visionMaxDim: { type: 'integer', description: '视觉API最大长边像素，默认1024', default: 1024, minimum: 512, maximum: 2048 },
          visionQuality: { type: 'integer', description: '视觉API图片质量，默认65', default: 65, minimum: 30, maximum: 95 }
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
      description: '获取浏览器和系统环境信息',
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
      description: '向页面注入CSS样式',
      parameters: {
        type: 'object',
        properties: {
          css: { type: 'string', description: 'CSS样式代码' },
          targetSelector: { type: 'string', description: '限定应用范围的元素选择器' },
          injectMode: { type: 'string', enum: ['style', 'inline'], description: '注入模式', default: 'style' }
        },
        required: ['css']
      }
    }
  },
];
