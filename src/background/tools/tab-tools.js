// tab-tools - tab management + bookmark history tool definitions

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
      description: 'Tab management',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['open', 'switch', 'close', 'reload', 'navigate'], description: 'navigate=history back/forward (with direction); use open for URL' },
          url: { type: 'string', description: 'open only' },
          tabId: { type: 'integer', description: 'required for non-open actions' },
          active: { type: 'boolean' },
          waitForLoad: { type: 'boolean' },
          loadTimeout: { type: 'integer' },
          bypassCache: { type: 'boolean' },
          direction: { type: 'string', enum: ['back', 'forward'], description: 'navigate only' }
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
      description: 'Get tab list; mode=active returns the current active tab tabId (use this when unsure which tab to operate on)',
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
      description: 'Search browser bookmarks/history',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['bookmark', 'history'] },
          query: { type: 'string' },
          maxResults: { type: 'integer' },
          startTime: { type: 'integer', description: 'history only' },
          endTime: { type: 'integer', description: 'history only' }
        },
        required: ['action', 'query']
      }
    }
  },
];
