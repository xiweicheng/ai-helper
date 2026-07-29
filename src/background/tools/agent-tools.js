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
      description: '回收站',
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
    id: 'agent_exec',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_exec',
      description: '执行命令',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          force: { type: 'boolean', description: '强制执行已确认命令' },
          timeoutMs: { type: 'integer' }
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
      description: '搜索文件/内容',
      parameters: {
        type: 'object',
        properties: {
          searchType: { type: 'string', enum: ['file', 'content'] },
          path: { type: 'string' },
          pattern: { type: 'string' },
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
    id: 'agent_skill',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_skill',
      description: 'Skill加载/执行',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['load', 'run'] },
          name: { type: 'string' },
          params: { type: 'object', description: 'run时需要' }
        },
        required: ['action', 'name']
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
          agentName: { type: 'string' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'exec_log',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'exec_log',
      description: '提取历史执行日志，分析成功路径与失败教训。',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['last_n_rounds', 'full_session'], description: '范围' },
          rounds: { type: 'integer', description: '轮数(默认3)' },
          sessionId: { type: 'string', description: '会话ID' }
        },
        required: ['scope']
      }
    }
  },
];
