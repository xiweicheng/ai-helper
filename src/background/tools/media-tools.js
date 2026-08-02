// media-tools - media output + debug dev tool definitions

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
      description: 'Show notification',
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
      description: 'Clipboard read/write',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['copy', 'paste', 'get_selected'] },
          text: { type: 'string', description: 'required for copy' },
          format: { type: 'string', enum: ['text', 'html'], description: 'for get_selected' }
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
      description: 'Download file',
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
      description: 'Generate QR code',
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
      description: 'Capture screenshot of current page. If the user message already contains an image, analyze it directly and do not call this tool.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['download', 'analyze', 'both'] },
          tabId: { type: 'integer', description: 'required for analyze/both' },
          format: { type: 'string', enum: ['jpeg', 'png'] },
          quality: { type: 'integer' },
          visionMaxDim: { type: 'integer', minimum: 512, maximum: 2048, description: 'Max dimension (px) of image for vision analysis' },
          visionQuality: { type: 'integer', minimum: 30, maximum: 95, description: 'JPEG quality of image for vision analysis' }
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
      description: 'Browser information',
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
      description: 'Inject CSS',
      parameters: {
        type: 'object',
        properties: {
          css: { type: 'string' },
          targetSelector: { type: 'string' },
          injectMode: { type: 'string', enum: ['style', 'inline'], description: 'style=insert stylesheet, inline=inline style' }
        },
        required: ['css']
      }
    }
  },
];
