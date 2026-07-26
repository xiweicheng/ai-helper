// tab-tools - tab management + bookmark history 工具定义

export const TAB_TOOLS = [
  // ── 合并后的标签页管理工具 ──
  {
    id: 'manage_tab',
    category: 'tab_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    confirmationActions: ['close'],  // close 操作需 action 级确认
    type: 'function',
    function: {
      name: 'manage_tab',
      description: '标签页管理：打开/切换/关闭/刷新/前进后退',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['open', 'switch', 'close', 'reload', 'navigate'], description: '操作类型' },
          url: { type: 'string', description: '要打开的URL（action=open时需要）' },
          tabId: { type: 'integer', description: '目标标签页ID（action≠open时需要，可通过 get_tabs 获取）' },
          active: { type: 'boolean', description: '是否激活新标签页（action=open），默认true', default: true },
          waitForLoad: { type: 'boolean', description: '等待页面加载完成再返回（action=open），默认false', default: false },
          loadTimeout: { type: 'integer', description: '加载超时毫秒数（waitForLoad=true时），默认15000', default: 15000 },
          bypassCache: { type: 'boolean', description: '跳过缓存强制刷新（action=reload），默认false', default: false },
          direction: { type: 'string', enum: ['back', 'forward'], description: '导航方向（action=navigate），默认back', default: 'back' }
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
  // ── 合并后的浏览器数据搜索工具 ──
  {
    id: 'search_browser_data',
    category: 'bookmark_history',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_browser_data',
      description: '搜索浏览器书签或访问历史',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['bookmark', 'history'], description: '搜索类型：bookmark=书签，history=访问历史' },
          query: { type: 'string', description: '搜索关键词' },
          maxResults: { type: 'integer', description: '最大结果数，默认10', default: 10 },
          startTime: { type: 'integer', description: '开始时间（Unix毫秒时间戳，仅action=history时有效）' },
          endTime: { type: 'integer', description: '结束时间（Unix毫秒时间戳，仅action=history时有效）' }
        },
        required: ['action', 'query']
      }
    }
  },
];
