// agent-tools - local agent 工具定义

export const AGENT_TOOLS = [
  {
    id: 'agent_file',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    confirmationActions: ['delete'],
    type: 'function',
    function: {
      name: 'agent_file',
      description: '文件操作',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'list', 'delete', 'download'] },
          path: { type: 'string', description: 'list时可选' },
          content: { type: 'string', description: 'write时需要' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'agent_trash',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_trash',
      description: '回收站管理',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'restore'] },
          trashId: { type: 'string', description: 'restore时需要' },
          hours: { type: 'integer' },
          type: { type: 'string', enum: ['file', 'directory'] }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'agent_exec_command',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_exec_command',
      description: '执行命令',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          force: { type: 'boolean', description: '强制执行已确认命令' },
          timeout: { type: 'integer', description: '超时ms' }
        },
        required: ['command']
      }
    }
  },
  {
    id: 'agent_search',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_search',
      description: '搜索',
      parameters: {
        type: 'object',
        properties: {
          searchType: { type: 'string', enum: ['file', 'content'] },
          path: { type: 'string' },
          pattern: { type: 'string', description: 'glob或关键词' },
          recursive: { type: 'boolean' },
          filePattern: { type: 'string' },
          caseSensitive: { type: 'boolean' },
          maxResults: { type: 'integer' },
          contextLines: { type: 'integer' }
        },
        required: ['searchType', 'path']
      }
    }
  },
  {
    id: 'agent_skill_load',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_skill_load',
      description: '加载Skill',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      }
    }
  },
  {
    id: 'agent_workflow_run',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_workflow_run',
      description: '执行Workflow',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          params: { type: 'object' }
        },
        required: ['name']
      }
    }
  },
  {
    id: 'manage_agent',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'manage_agent',
      description: '代理管理',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'switch'] },
          agentId: { type: 'string', description: 'switch时需要' },
          agentName: { type: 'string', description: 'switch时模糊匹配' }
        },
        required: ['action']
      }
    }
  },
];
