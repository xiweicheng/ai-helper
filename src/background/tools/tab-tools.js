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
      description: 'Manage browser tabs. open=navigate to URL (requires url), switch=change active tab (requires tabId), close=close tab, reload=refresh page, navigate=history back/forward (requires direction)',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['open', 'switch', 'close', 'reload', 'navigate'], description: 'open: new URL; switch: change tab; close: close tab; reload: refresh; navigate: history back/forward' },
          url: { type: 'string', description: 'Required when action=open' },
          tabId: { type: 'integer', description: 'Required for switch/close/reload; omit for open' },
          active: { type: 'boolean' },
          waitForLoad: { type: 'boolean' },
          loadTimeout: { type: 'integer' },
          bypassCache: { type: 'boolean' },
          direction: { type: 'string', enum: ['back', 'forward'], description: 'Required when action=navigate' }
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
      description: 'Get list of open tabs. Use mode=active to get current tab tabId when unsure which tab to operate on',
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
      description: 'Search browser bookmarks or history',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['bookmark', 'history'], description: 'bookmark: search bookmarks; history: search browsing history' },
          query: { type: 'string' },
          maxResults: { type: 'integer' },
          startTime: { type: 'integer', description: 'history only: start timestamp (ms)' },
          endTime: { type: 'integer', description: 'history only: end timestamp (ms)' }
        },
        required: ['action', 'query']
      }
    }
  },
];
