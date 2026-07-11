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
      description: '读写localStorage/sessionStorage',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'clear'], description: '操作类型', default: 'get' },
          storage: { type: 'string', enum: ['local', 'session'], description: '存储类型', default: 'local' },
          key: { type: 'string', description: '键名' },
          value: { type: 'string', description: '值（set操作时必需）' }
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
      description: '读取/设置/删除浏览器Cookie',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'remove', 'list'], description: '操作类型' },
          name: { type: 'string', description: 'Cookie名称' },
          value: { type: 'string', description: 'Cookie值（set时必需）' },
          domain: { type: 'string', description: '域名，默认当前域名' },
          path: { type: 'string', description: '路径，默认"/"' },
          secure: { type: 'boolean', description: '仅HTTPS', default: false },
          httpOnly: { type: 'boolean', description: 'HttpOnly', default: false },
          expirationDate: { type: 'number', description: '过期时间（Unix时间戳秒）' }
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
      description: '清除当前站点的存储和缓存数据',
      parameters: {
        type: 'object',
        properties: {
          site: { type: 'string', description: '指定站点URL模式，不指定则清除当前站点' }
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
      description: '发起HTTP请求',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '请求URL' },
          method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP方法', default: 'GET' },
          headers: { type: 'object', description: '请求头' },
          body: { type: 'string', description: 'POST请求体（JSON字符串）' },
          timeout: { type: 'integer', description: '超时（ms），默认30000', default: 30000 }
        },
        required: ['url']
      }
    }
  },
];
