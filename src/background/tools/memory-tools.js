// memory-tools - 长期记忆工具定义（3合1）
// 记忆文件路径：~/.ai-helper-agent/memory/global-memory.json（Agent 系统配置目录）
// 实际存储于 Agent 本地文件系统，通过 agent_file 读写

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
      description: '长期记忆管理。action=store时增删改(subAction:add/update/delete+type+content,update/delete需memoryId)，action=recall时关键词检索(需query+memoryType+limit)，action=manage时审查清理(subAction:review/compact)。query用关键词不用完整句子，删前先recall查id。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['store', 'recall', 'manage'], description: '操作类型' },
          subAction: { type: 'string', description: '子操作: store时=add/update/delete, manage时=review/compact' },
          type: { type: 'string', enum: ['fact', 'summary'], description: 'store时必填: 记忆类型' },
          category: { type: 'string', enum: ['preference', 'knowledge', 'decision', 'custom'], description: 'store时可选: 记忆分类' },
          content: { type: 'string', description: 'store时必填(delete除外): 记忆内容' },
          title: { type: 'string', description: 'store时可选: summary类型标题' },
          tags: { type: 'array', items: { type: 'string' }, description: 'store/recall时可选: 标签筛选' },
          importance: { type: 'integer', description: 'store时可选: 重要性1-10' },
          memoryId: { type: 'string', description: 'store时update/delete必填: 记忆ID' },
          sourceSessionId: { type: 'string', description: 'store时可选: 来源会话ID' },
          query: { type: 'string', description: 'recall时必填: 检索关键词' },
          memoryType: { type: 'string', enum: ['fact', 'summary', 'all'], description: 'recall时可选: 记忆类型筛选,默认all' },
          limit: { type: 'integer', description: 'recall时可选: 返回数量上限,默认10' }
        },
        required: ['action']
      }
    }
  }
];
