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
      description: 'Storage read/write',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'clear'], description: 'Operation type' },
          storage: { type: 'string', enum: ['local', 'session'] },
          key: { type: 'string' },
          value: { type: 'string', description: 'required for set' }
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
      description: 'Cookie management',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'list'], description: 'Operation type' },
          name: { type: 'string' },
          value: { type: 'string', description: 'required for set' },
          domain: { type: 'string' },
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
      description: 'Clear site data',
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
      description: 'HTTP request',
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
