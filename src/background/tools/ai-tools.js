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
    id: 'plan_task',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'plan_task',
      description: 'Plan and decompose a complex task into subtasks for structured execution. Call this tool alone: do not combine it with other tool calls in the same turn; put other intended actions into the subtask descriptions',
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
          strategy: { type: 'string', enum: ['sequential', 'parallel', 'dependency'], description: 'Execution strategy: sequential = run subtasks in listed order; parallel = run independent subtasks concurrently; dependency = run subtasks in topological order derived from their dependencies' },
          failureStrategy: { type: 'string', enum: ['stop', 'continue', 'skip'], description: 'What to do when a subtask fails after retries: stop = halt remaining subtasks and roll back; continue/skip = keep executing the rest (default continue)' },
          maxRetries: { type: 'integer', description: 'Max retries per failed subtask (default 1, clamped to 0-3)' },
          maxParallel: { type: 'integer', description: 'Max concurrent subtasks when strategy is parallel (default 3, clamped to 1-8)' }
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

// M-new-1：doneCriteria 子任务达标断言的 schema。默认**不**随 AI_TOOLS 静态下发
//（关闭完成度校验时下发给模型的工具定义逐字节=基线）；由 getTools 在
// completionVerification.enabled 为真时动态注入到 plan_task 的 subtask items。
export const PLAN_TASK_DONE_CRITERIA_ITEM = {
  type: 'array',
  description: 'Optional objective done-criteria to verify this subtask truly achieved its goal. Only verified when the "completion verification" setting is enabled. Unknown check types are ignored (fail-closed). Leave empty for open-ended subtasks.',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      check: { type: 'string', enum: ['element_exists', 'element_absent', 'text_contains', 'url_matches', 'attribute_equals'] },
      target: { type: 'string', description: 'Meaning depends on check: element_exists/element_absent/attribute_equals -> CSS selector (verification pierces shadow DOM/iframe); url_matches -> a URL substring; text_contains -> optional fallback text (prefer expected). ' },
      expected: { type: 'string', description: 'text_contains -> substring to find in page text. attribute_equals -> MUST be the form "attr=value" (one = separated pair). url_matches -> fallback substring when target absent. ' }
    },
    required: ['check']
  }
};
