// memory-tools - long-term memory tool definitions (3-in-1)
// Memory file path: ~/.ai-helper-agent/memory/global-memory.json (Agent system config directory)
// Actually stored on the Agent local file system, read/written via agent_file

export const MEMORY_TOOLS = [
  {
    id: 'agent_memory',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_memory',
      description: 'Long-term memory management',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['store', 'recall', 'manage'], description: 'Operation type' },
          subAction: { type: 'string', description: 'Sub-action: when store = add/update/delete, when manage = review/compact' },
          type: { type: 'string', enum: ['fact', 'summary'], description: 'Memory type' },
          category: { type: 'string', enum: ['preference', 'knowledge', 'decision', 'custom'], description: 'optional for store: memory category' },
          content: { type: 'string', description: 'required for store: memory content' },
          title: { type: 'string', description: 'optional for store: title for summary type' },
          tags: { type: 'array', items: { type: 'string' }, description: 'optional for store/recall: tag filter' },
          importance: { type: 'integer', description: 'optional for store: importance 1-10' },
          memoryId: { type: 'string', description: 'required for store update/delete: memory ID' },
          sourceSessionId: { type: 'string', description: 'optional for store: source session ID' },
          query: { type: 'string', description: 'required for recall: search keyword' },
          memoryType: { type: 'string', enum: ['fact', 'summary', 'all'], description: 'optional for recall: memory type filter, default all' },
          limit: { type: 'integer', description: 'optional for recall: max number of results, default 10' }
        },
        required: ['action']
      }
    }
  }
];
