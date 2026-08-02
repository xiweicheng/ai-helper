// ai-tools - ai collaboration tool definitions

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
      description: 'Clarify question',
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
    category: 'debug_dev',
    execution: 'content_script',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'highlight_text',
      description: 'Highlight text',
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
      description: 'Task planning',
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
      description: 'Search conversation history. When query is empty, returns all messages of the current session',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword; empty returns all' },
          maxResults: { type: 'integer' },
          searchScope: { type: 'string', enum: ['current_session', 'all_sessions'] }
        }
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
      description: 'UI prototype preview/get',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['preview', 'get'] },
          html: { type: 'string', description: 'required for preview' },
          title: { type: 'string', description: 'required for preview' },
          description: { type: 'string' },
          prototypeId: { type: 'string', description: 'required for get' }
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
      description: 'Dispatch task to sub-agent',
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
