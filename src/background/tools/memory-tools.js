// memory-tools - 长期记忆工具定义
// 记忆文件路径：~/.ai-helper-agent/memory/global-memory.json（Agent 系统配置目录）
// 实际存储于 Agent 本地文件系统，通过 agent_file 读写

export const MEMORY_TOOLS = [
  {
    id: 'agent_memory_store',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_memory_store',
      description: '存储/更新/删除记忆。add需type+content，update/delete需memoryId+type。**删除前必须先recall获取id和type**。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete'] },
          type: { type: 'string', enum: ['fact', 'summary'] },
          category: { type: 'string', enum: ['preference', 'knowledge', 'decision', 'custom'] },
          content: { type: 'string' },
          title: { type: 'string', description: '仅summary' },
          tags: { type: 'array', items: { type: 'string' } },
          importance: { type: 'integer', description: '1-10' },
          memoryId: { type: 'string', description: 'update/delete必填' },
          sourceSessionId: { type: 'string' }
        },
        required: ['action', 'type', 'content']
      }
    }
  },
  {
    id: 'agent_memory_recall',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_memory_recall',
      description: '检索记忆。**query用关键词**（如"考试"），不要完整句子。可按tags筛选。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          memoryType: { type: 'string', enum: ['fact', 'summary', 'all'] },
          limit: { type: 'integer' }
        }
      }
    }
  },
  {
    id: 'agent_memory_manage',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_memory_manage',
      description: '管理记忆。review审查价值，compact清理低价值。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['review', 'compact'] }
        },
        required: ['action']
      }
    }
  }
];
