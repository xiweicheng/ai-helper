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
      description: '存储/更新/删除长期记忆。action=add（需type+content），update（需memoryId+type），delete（需memoryId+type）。**删除前必须先用recall确认记忆的id和type**。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete'], description: 'add新增 / update修改 / delete删除' },
          type: { type: 'string', enum: ['fact', 'summary'], description: 'fact事实 / summary摘要' },
          category: { type: 'string', enum: ['preference', 'knowledge', 'decision', 'custom'], description: '记忆分类' },
          content: { type: 'string', description: '记忆内容' },
          title: { type: 'string', description: '仅summary类型' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签数组，用于检索' },
          importance: { type: 'integer', description: '重要性1-10，越大越重要' },
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
      description: '检索长期记忆。**query请用简短关键词**（如"考试"、"Python配置"），不要传入完整句子。也可通过tags筛选。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，如"考试"、"Python配置"' },
          tags: { type: 'array', items: { type: 'string' }, description: '按标签筛选' },
          memoryType: { type: 'string', enum: ['fact', 'summary', 'all'], description: 'fact / summary / all' },
          limit: { type: 'integer', description: '返回结果上限' }
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
      description: '管理长期记忆。action=review：查看记忆价值评估和淘汰建议。action=compact：自动清理低价值记忆。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['review', 'compact'], description: 'review审查 / compact清理' }
        },
        required: ['action']
      }
    }
  }
];
