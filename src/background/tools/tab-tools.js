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
];
