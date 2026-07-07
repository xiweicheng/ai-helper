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
      description: '读写localStorage或sessionStorage。用于调试前端状态、注入/导出缓存数据',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '操作类型：get（读取）、set（写入）、remove（删除）、clear（清空）',
            enum: ['get', 'set', 'remove', 'clear'],
            default: 'get'
          },
          storage: {
            type: 'string',
            description: '存储类型：local（localStorage）、session（sessionStorage）',
            enum: ['local', 'session'],
            default: 'local'
          },
          key: {
            type: 'string',
            description: '键名'
          },
          value: {
            type: 'string',
            description: '值（set操作时必需）'
          }
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
      description: '读取、设置、删除浏览器Cookie，支持登录态管理和跨域调试',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['get', 'set', 'remove', 'list'],
            description: '操作类型：get(获取单个)、set(设置)、remove(删除)、list(列出所有)'
          },
          name: {
            type: 'string',
            description: 'Cookie名称（get/set/remove操作必需）'
          },
          value: {
            type: 'string',
            description: 'Cookie值（set操作必需）'
          },
          domain: {
            type: 'string',
            description: 'Cookie所属域名，默认当前域名'
          },
          path: {
            type: 'string',
            description: 'Cookie路径，默认"/"'
          },
          secure: {
            type: 'boolean',
            description: '是否仅在HTTPS下发送，默认false',
            default: false
          },
          httpOnly: {
            type: 'boolean',
            description: '是否为HttpOnly，默认false',
            default: false
          },
          expirationDate: {
            type: 'number',
            description: '过期时间（Unix时间戳，秒），不设置则为会话Cookie'
          }
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
      description: '一键清除当前站点的 localStorage、sessionStorage、Cookie 和缓存数据，方便调试',
      parameters: {
        type: 'object',
        properties: {
          site: { type: 'string', description: '指定要清除的站点（URL 模式），不指定则清除当前标签页站点' }
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
      description: '发起HTTP请求获取数据，支持GET/POST方法。适用于获取接口数据、下载页面内容、调用第三方API',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '请求URL'
          },
          method: {
            type: 'string',
            description: 'HTTP方法：GET、POST',
            enum: ['GET', 'POST'],
            default: 'GET'
          },
          headers: {
            type: 'object',
            description: '请求头，如 {"Content-Type": "application/json"}'
          },
          body: {
            type: 'string',
            description: 'POST请求体（JSON字符串）'
          },
          timeout: {
            type: 'integer',
            description: '请求超时时间（毫秒），默认30000ms',
            default: 30000
          }
        },
        required: ['url']
      }
    }
  },
];
