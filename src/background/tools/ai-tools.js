// ai-tools - ai collaboration 工具定义

export const AI_TOOLS = [
  {
    id: 'clarify_question',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'clarify_question',
      description: '澄清问题',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          recommendedOption: { type: 'integer' },
          allowCustomInput: { type: 'boolean' },
          allowAdditionalInfo: { type: 'boolean' }
        },
        required: ['question', 'options', 'recommendedOption']
      }
    }
  },
  {
    id: 'highlight_text',
    category: 'ai_collaboration',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'highlight_text',
      description: '高亮文本',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          color: { type: 'string' }
        },
        required: ['text']
      }
    }
  },
{
    id: 'plan_task',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'plan_task',
      description: '任务规划',
      parameters: {
        type: 'object',
        properties: {
          taskDescription: { type: 'string' },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                dependencies: { type: 'array', items: { type: 'string' } },
                estimatedSteps: { type: 'integer' }
              },
              required: ['id', 'name', 'description']
            }
          },
          isComplex: { type: 'boolean' },
          strategy: { type: 'string', enum: ['sequential', 'parallel', 'conditional'] }
        },
        required: ['taskDescription', 'subtasks']
      }
    }
  },
{
    id: 'search_chats',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_chats',
      description: '搜索对话记录',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'integer' },
          searchScope: { type: 'string', enum: ['current_session', 'all_sessions'] }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'preview_ui',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'preview_ui',
      description: 'UI原型',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['preview', 'get'] },
          html: { type: 'string', description: 'preview时需要' },
          title: { type: 'string' },
          description: { type: 'string' },
          prototypeId: { type: 'string', description: 'get时需要' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'dispatch_task',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'dispatch_task',
      description: '分派子任务',
      parameters: {
        type: 'object',
        properties: {
          subAgentId: { type: 'string' },
          task: { type: 'string' }
        },
        required: ['subAgentId', 'task']
      }
    }
  },
];
