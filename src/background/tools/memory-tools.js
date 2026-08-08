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
      description: 'Long-term memory management. store: save memories (subAction: add/update/delete); recall: search memories; manage: review/compact memory store',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['store', 'recall', 'manage'], description: 'store: save a memory (requires subAction); recall: search memories (requires query); manage: maintenance (requires subAction)' },
          subAction: { type: 'string', description: 'When action=store: add (create new), update (modify existing, requires memoryId), delete (remove, requires memoryId). When action=manage: review (list all), compact (merge/reduce)' },
          type: { type: 'string', enum: ['fact', 'summary'], description: 'Memory type' },
          category: { type: 'string', enum: ['preference', 'knowledge', 'decision', 'custom'], description: 'optional for store: memory category' },
          content: { type: 'string', description: 'Required for store: memory content to save' },
          title: { type: 'string', description: 'optional for store: title for summary type' },
          tags: { type: 'array', items: { type: 'string' }, description: 'optional for store/recall: tag filter' },
          importance: { type: 'integer', description: 'optional for store: importance 1-10' },
          memoryId: { type: 'string', description: 'Required for store subAction=update/delete: target memory ID' },
          sourceSessionId: { type: 'string', description: 'optional for store: source session ID' },
          query: { type: 'string', description: 'Required for recall: search keyword to find memories' },
          memoryType: { type: 'string', enum: ['fact', 'summary', 'all'], description: 'optional for recall: memory type filter, default all' },
          limit: { type: 'integer', description: 'optional for recall: max number of results, default 10' }
        },
        required: ['action']
      }
    }
  }
];
