// media-tools - media output + debug dev 工具定义

export const MEDIA_TOOLS = [
  {
    id: 'notify',
    category: 'media_output',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'notify',
      description: '显示通知',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          message: { type: 'string' },
          icon: { type: 'string' },
          silent: { type: 'boolean' },
          requireInteraction: { type: 'boolean' },
          playSound: { type: 'boolean' },
          soundType: { type: 'string', enum: ['default', 'success', 'warning', 'error'] }
        },
        required: ['title', 'message']
      }
    }
  },
  {
    id: 'clipboard',
    category: 'media_output',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'clipboard',
      description: '剪贴板',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['copy', 'paste', 'get_selected'] },
          text: { type: 'string', description: 'copy时需要' },
          format: { type: 'string', enum: ['text', 'html'], description: 'get_selected时' }
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
      description: '下载文件',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          filename: { type: 'string' }
        },
        required: ['url']
      }
    }
  },
  {
    id: 'qrcode',
    category: 'media_output',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'qrcode',
      description: '生成二维码',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          size: { type: 'integer' },
          errorCorrection: { type: 'string', enum: ['L', 'M', 'Q', 'H'] },
          showImage: { type: 'boolean' }
        }
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
      description: '页面截图',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['download', 'analyze', 'both'] },
          tabId: { type: 'integer', description: 'analyze/both时需要' },
          format: { type: 'string', enum: ['jpeg', 'png'] },
          quality: { type: 'integer' },
          visionMaxDim: { type: 'integer', minimum: 512, maximum: 2048, description: '视觉分析图片最大边长(px)' },
          visionQuality: { type: 'integer', minimum: 30, maximum: 95, description: '视觉分析图片JPEG质量' }
        }
      }
    }
  },
  {
    id: 'browser_info',
    category: 'debug_dev',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'browser_info',
      description: '浏览器信息',
      parameters: {
        type: 'object',
        properties: {}
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
      description: '注入CSS',
      parameters: {
        type: 'object',
        properties: {
          css: { type: 'string' },
          targetSelector: { type: 'string' },
          injectMode: { type: 'string', enum: ['style', 'inline'] }
        },
        required: ['css']
      }
    }
  },
];
