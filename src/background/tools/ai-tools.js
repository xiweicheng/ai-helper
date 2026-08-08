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
      description: 'Ask the user a clarifying question with options when the task is ambiguous. Pauses execution until user responds',
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
      description: 'Highlight text on the page for visual emphasis',
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
      description: 'Plan and decompose a complex task into subtasks for structured execution',
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
      description: 'Search past conversation history for context or previous answers',
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
      description: 'Preview or retrieve a UI prototype. preview: render HTML in side panel (requires html+title); get: load a previously saved prototype (requires prototypeId)',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['preview', 'get'], description: 'preview: render HTML (requires html+title); get: load saved prototype (requires prototypeId)' },
          html: { type: 'string', description: 'Required for preview: HTML content to render' },
          title: { type: 'string', description: 'Required for preview: title of the prototype' },
          description: { type: 'string' },
          prototypeId: { type: 'string', description: 'Required for get: ID of saved prototype' }
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
      description: 'Dispatch a task to a sub-agent for parallel or specialized execution',
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
