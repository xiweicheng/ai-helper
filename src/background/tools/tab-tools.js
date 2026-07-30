// tab-tools - tab management + bookmark history 工具定义

export const TAB_TOOLS = [
  {
    id: 'manage_tab',
    category: 'tab_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    confirmationActions: ['close'],
    type: 'function',
    function: {
      name: 'manage_tab',
      description: '标签页管理',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['open', 'switch', 'close', 'reload', 'navigate'], description: '操作类型' },
          url: { type: 'string', description: 'open时需要' },
          tabId: { type: 'integer', description: '非open时需要' },
          active: { type: 'boolean' },
          waitForLoad: { type: 'boolean' },
          loadTimeout: { type: 'integer' },
          bypassCache: { type: 'boolean' },
          direction: { type: 'string', enum: ['back', 'forward'] }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'list_tabs',
    category: 'tab_management',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'list_tabs',
      description: '获取标签页列表',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['all', 'active'] },
          includeUrl: { type: 'boolean' },
          includeTitle: { type: 'boolean' }
        }
      }
    }
  },
  {
    id: 'search_browser_data',
    category: 'bookmark_history',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_browser_data',
      description: '搜索浏览器书签/历史',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['bookmark', 'history'] },
          query: { type: 'string' },
          maxResults: { type: 'integer' },
          startTime: { type: 'integer', description: '仅history' },
          endTime: { type: 'integer', description: '仅history' }
        },
        required: ['action', 'query']
      }
    }
  },
];
