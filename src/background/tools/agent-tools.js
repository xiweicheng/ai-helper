// agent-tools - local agent tool definitions

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
      description: 'File operations',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'list', 'delete', 'download'], description: 'Operation type' },
          path: { type: 'string', description: 'optional for list' },
          content: { type: 'string', description: 'required for write' }
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
      description: 'Trash management',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'restore'], description: 'Operation type' },
          trashId: { type: 'string', description: 'required for restore' },
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
      description: 'Execute command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          force: { type: 'boolean', description: 'Force execute confirmed command' },
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
      description: 'Search files/content',
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
      description: 'Skill load and execute (use run for Workflow, use load for Agent)',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['load', 'run'], description: 'run is only for Workflow Skill; load is for loading Agent Skill instructions' },
          name: { type: 'string' },
          params: { type: 'object', description: 'required for run' }
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
      description: 'Agent management',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'switch'] },
          agentId: { type: 'string', description: 'required for switch' },
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
      description: 'Extract historical execution logs to analyze successful paths and failure lessons.',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['last_n_rounds', 'full_session'], description: 'Scope' },
          rounds: { type: 'integer', description: 'Number of rounds (default 3)' },
          sessionId: { type: 'string', description: 'Session ID' }
        },
        required: ['scope']
      }
    }
  },
];
