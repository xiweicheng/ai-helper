// storage-tools - storage management + network request tool definitions

export const STORAGE_TOOLS = [
{
    id: 'manage_storage',
    category: 'storage_management',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'manage_storage',
      description: 'Read/write browser localStorage or sessionStorage',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'clear'], description: 'get: read key; set: write key+value (requires value); remove: delete key; clear: wipe all' },
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
      description: 'Get/set/remove/list browser cookies',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'list'], description: 'get: read by name; set: write (requires name+value+domain); remove: delete by name; list: list all' },
          name: { type: 'string' },
          value: { type: 'string', description: 'Required for set' },
          domain: { type: 'string', description: 'Required for set' },
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
    id: 'clear_data',
    category: 'storage_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'clear_data',
      description: 'Clear localStorage/sessionStorage for a site or current page',
      parameters: {
        type: 'object',
        properties: {
          site: { type: 'string' }
        }
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
      description: 'Send HTTP GET/POST request to a URL. Returns response body as text. For JavaScript-rendered pages, use manage_tab(open)+page_content instead',
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
