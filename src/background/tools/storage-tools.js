// storage-tools - storage management + network request 工具定义

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
      description: '管理存储',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'clear'] },
          storage: { type: 'string', enum: ['local', 'session'] },
          key: { type: 'string' },
          value: { type: 'string', description: 'set时需要' }
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
      description: '管理Cookies',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'list'] },
          name: { type: 'string' },
          value: { type: 'string', description: 'set时需要' },
          domain: { type: 'string' },
          path: { type: 'string' },
          secure: { type: 'boolean' },
          httpOnly: { type: 'boolean' },
          expirationDate: { type: 'number', description: 'Unix时间戳秒' }
        },
        required: ['action']
      }
    }
  },
{
    id: 'clear_page_data',
    category: 'storage_management',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'clear_page_data',
      description: '清除站点数据',
      parameters: {
        type: 'object',
        properties: {
          site: { type: 'string', description: '指定站点URL模式' }
        },
        required: []
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
      description: 'HTTP请求',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string', enum: ['GET', 'POST'] },
          headers: { type: 'object' },
          body: { type: 'string', description: 'JSON字符串' },
          timeout: { type: 'integer', description: '超时ms' }
        },
        required: ['url']
      }
    }
  },
];
