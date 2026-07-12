// memory-tools - 长期记忆工具定义
// 记忆文件路径：相对于 Agent 工作目录的 config/memory/global-memory.json
// 实际存储于 Agent 本地文件系统，通过 agent_read_file / agent_write_file 读写

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
      description: '存储/更新/删除长期记忆。当用户说"记住xxx"或对话中出现值得长期保留的信息时调用此工具',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete'], description: '操作类型' },
          type: { type: 'string', enum: ['fact', 'summary'], description: '记忆类型：fact=事实/偏好/知识，summary=对话摘要' },
          category: { type: 'string', enum: ['preference', 'knowledge', 'decision', 'custom'], description: '分类（仅fact类型需要）' },
          content: { type: 'string', description: '记忆内容（必填）' },
          title: { type: 'string', description: '摘要标题（仅summary类型需要）' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签列表，用于检索和分类' },
          importance: { type: 'integer', description: '重要性 1-10，默认5' },
          memoryId: { type: 'string', description: '记忆ID，update/delete时必须提供' },
          sourceSessionId: { type: 'string', description: '来源会话ID（可选）' }
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
      description: '从长期记忆中检索相关信息。根据关键词、标签搜索已存储的记忆，返回匹配的结果',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，匹配记忆内容和标签' },
          tags: { type: 'array', items: { type: 'string' }, description: '按标签筛选' },
          memoryType: { type: 'string', enum: ['fact', 'summary', 'all'], description: '记忆类型筛选', default: 'all' },
          limit: { type: 'integer', description: '最大返回条数，默认10', default: 10 }
        },
        required: []
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
      description: '管理长期记忆：审查记忆质量、合并重复记忆、淘汰低价值记忆。当记忆数量接近上限（facts≥40或summaries≥16）或用户要求整理时调用',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['review', 'compact'], description: 'review=审查返回淘汰建议，compact=执行压缩清理' }
        },
        required: ['action']
      }
    }
  }
];
