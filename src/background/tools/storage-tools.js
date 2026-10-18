// storage-tools - storage management + network request tool definitions

export const STORAGE_TOOLS = [
  {
    id: 'manage_storage',
    category: 'storage_management',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    confirmationActions: ['clear'],
    type: 'function',
    function: {
      name: 'manage_storage',
      description: 'Read/write browser localStorage or sessionStorage. To wipe cookies of a site as well, use manage_cookies(action=clear)',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'clear'], description: 'get: read key; set: write key+value (requires value); remove: delete key; clear: wipe all (requires user confirmation)' },
          storage: { type: 'string', enum: ['local', 'session'] },
          key: { type: 'string', description: 'Required for get/set/remove' },
          value: { type: 'string', description: 'Required for set' }
        },
        required: ['action', 'storage']
      }
    }
  },
  {
    id: 'manage_cookies',
    category: 'storage_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'manage_cookies',
      description: 'Get/set/remove/clear/list browser cookies',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'clear', 'list'], description: 'get: read by name; set: write (requires name+value+domain); remove: delete by name; clear: remove ALL cookies of a domain (domain optional, defaults to current tab site); list: list all' },
          name: { type: 'string' },
          value: { type: 'string', description: 'Required for set' },
          domain: { type: 'string', description: 'Required for set; optional for clear (target site, defaults to current tab)' },
          path: { type: 'string' },
          secure: { type: 'boolean' },
          httpOnly: { type: 'boolean' },
          expirationDate: { type: 'number' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'fetch_url',
    category: 'network_request',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Send HTTP GET/POST request to a URL. Returns response body as text. For JavaScript-rendered pages, use manage_tab(open)+page_content instead. Restricted: only http/https targets can be reached, and loopback/private-network targets are refused unless the user enables "Private network access" in extension settings and allowlists that exact host — do not retry a refused private address',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string', enum: ['GET', 'POST'] },
          headers: { type: 'object' },
          body: { type: 'string' },
          timeout: { type: 'integer' }
        },
        required: ['url']
      }
    }
  },
];
