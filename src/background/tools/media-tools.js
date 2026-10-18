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
      description: 'Clipboard operations. copy: write text to clipboard (requires text); paste: paste from clipboard; get_selected: get currently selected text on page',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['copy', 'paste', 'get_selected'], description: 'copy: write text; paste: paste clipboard; get_selected: get page selection' },
          text: { type: 'string', description: 'Required for copy' },
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
          content: { type: 'string', description: 'Text/URL to encode; omit to encode the current page URL' },
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
      description: 'Capture page screenshot. download: save image locally; analyze: send to vision model for analysis (requires vision API configured); both: download + analyze',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['download', 'analyze', 'both'], description: 'download: save locally; analyze: vision model analysis; both: download + analyze' },
          tabId: { type: 'integer', description: 'Required for analyze/both' },
          format: { type: 'string', enum: ['jpeg', 'png'] },
          quality: { type: 'integer' },
          visionMaxDim: { type: 'integer', minimum: 512, maximum: 2048, description: 'Max dimension (px) of image for vision analysis' },
          visionQuality: { type: 'integer', minimum: 30, maximum: 95, description: 'JPEG quality of image for vision analysis' }
        },
        required: ['action']
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
      description: 'Modify page appearance. injectMode: style=insert stylesheet (requires css); inline=apply css to elements matching targetSelector (requires css+targetSelector); highlight=visually highlight texts matching text on the page (requires text, optional color, default yellow)',
      parameters: {
        type: 'object',
        properties: {
          css: { type: 'string', description: 'Required for style/inline modes' },
          targetSelector: { type: 'string', description: 'Required for inline mode' },
          injectMode: { type: 'string', enum: ['style', 'inline', 'highlight'], description: 'style: insert <style> tag; inline: apply to elements matching targetSelector; highlight: mark matched texts visually (does not modify structure)' },
          text: { type: 'string', description: 'Required for highlight mode: text to highlight' },
          color: { type: 'string', description: 'highlight only: highlight color, default yellow' }
        },
        required: ['injectMode']
      }
    }
  },
];
