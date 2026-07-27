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
          action: { type: 'string', enum: ['open', 'switch', 'close', 'reload', 'navigate'] },
          url: { type: 'string', description: 'open时需要' },
          tabId: { type: 'integer', description: 'open外的操作需要' },
          active: { type: 'boolean', description: '新标签页是否激活' },
          waitForLoad: { type: 'boolean' },
          loadTimeout: { type: 'integer', description: '加载超时ms' },
          bypassCache: { type: 'boolean', description: '跳过缓存' },
          direction: { type: 'string', enum: ['back', 'forward'] }
        },
        required: ['action']
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
      description: '获取标签页列表',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['all', 'active'] },
          includeUrl: { type: 'boolean' },
          includeTitle: { type: 'boolean' }
        },
        required: []
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
      description: '搜索书签/历史',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['bookmark', 'history'] },
          query: { type: 'string' },
          maxResults: { type: 'integer' },
          startTime: { type: 'integer', description: 'Unix毫秒时间戳，仅history' },
          endTime: { type: 'integer', description: 'Unix毫秒时间戳，仅history' }
        },
        required: ['action', 'query']
      }
    }
  },
];
