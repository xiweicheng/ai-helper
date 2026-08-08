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
      description: 'File operations on the agent local filesystem. read: get file content; write: create/overwrite file (requires content); list: list directory; delete: move to trash; download: download file to browser',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'list', 'delete', 'download'], description: 'read: get content; write: create/overwrite; list: directory listing; delete: trash; download: save to browser' },
          path: { type: 'string', description: 'File/directory path; optional for list (defaults to workdir)' },
          content: { type: 'string', description: 'Required for write: file content' }
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
      description: 'Manage agent trash bin. list: view deleted items; restore: recover from trash (requires trashId)',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'restore'], description: 'list: view trash; restore: recover item (requires trashId)' },
          trashId: { type: 'string', description: 'Required for restore' },
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
      description: 'Execute a shell command on the agent machine. Returns stdout/stderr and exit code',
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
      description: 'Search files or file content on the agent machine. file: find files by name pattern; content: search text/regex inside files',
      parameters: {
        type: 'object',
        properties: {
          searchType: { type: 'string', enum: ['file', 'content'], description: 'file: find files by name; content: search inside files' },
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
      description: 'Load or run a Skill. run: execute a Workflow Skill (requires params); load: load an Agent Skill instruction into context',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['load', 'run'], description: 'run: execute Workflow Skill (requires params); load: load Agent Skill instructions' },
          name: { type: 'string' },
          params: { type: 'object', description: 'Required for run: Workflow Skill parameters' }
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
      description: 'List or switch paired AI agents',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'switch'], description: 'list: show all paired agents; switch: change active agent (requires agentId)' },
          agentId: { type: 'string', description: 'Required for switch' },
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
