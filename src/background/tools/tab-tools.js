// tab-tools - tab management + bookmark history 工具定义

export const TAB_TOOLS = [
  {
    id: 'open_tab',
    category: 'tab_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'open_tab',
      description: '打开新的浏览器标签页',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要打开的URL' },
          active: { type: 'boolean', description: '是否激活新标签页', default: true }
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
      description: '切换到指定标签页',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID' }
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
      description: '关闭指定标签页',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '要关闭的标签页ID（可通过 get_tabs 获取）' }
        },
        required: ['tabId']
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
      description: '获取标签页列表或当前激活的标签页信息',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['all', 'active'], description: '获取模式：all=所有标签页，active=仅当前激活的标签页', default: 'all' },
          includeUrl: { type: 'boolean', description: '包含URL', default: true },
          includeTitle: { type: 'boolean', description: '包含标题', default: true }
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
      description: '当前标签页前进或后退',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['back', 'forward'], description: '导航方向', default: 'back' }
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
      description: '刷新标签页',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID（可通过 get_tabs 获取）' },
          bypassCache: { type: 'boolean', description: '跳过缓存强制刷新', default: false }
        },
        required: ['tabId']
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
      description: '搜索浏览器书签',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，匹配标题和URL' },
          maxResults: { type: 'integer', description: '最大结果数，默认10', default: 10 }
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
      description: '搜索浏览器访问历史',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          maxResults: { type: 'integer', description: '最大结果数，默认10', default: 10 },
          startTime: { type: 'integer', description: '开始时间（Unix毫秒时间戳）' },
          endTime: { type: 'integer', description: '结束时间（Unix毫秒时间戳）' }
        },
        required: ['query']
      }
    }
  },
];
