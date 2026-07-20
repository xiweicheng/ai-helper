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
      description: '弹出界面让用户选择或输入以澄清问题',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '需要澄清的问题' },
          options: { type: 'array', items: { type: 'string' }, description: '3-5个供用户选择的选项' },
          recommendedOption: { type: 'integer', description: '推荐选项索引（从0开始），必填' },
          allowCustomInput: { type: 'boolean', description: '允许自定义输入', default: true },
          allowAdditionalInfo: { type: 'boolean', description: '允许补充信息', default: true }
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
      description: '在页面上高亮指定文本',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要高亮的文本' },
          color: { type: 'string', description: '高亮颜色', default: 'yellow' }
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
      description: '任务规划与拆解，将复杂任务分解为子任务',
      parameters: {
        type: 'object',
        properties: {
          taskDescription: { type: 'string', description: '原始任务描述' },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '子任务ID' },
                name: { type: 'string', description: '子任务名称' },
                description: { type: 'string', description: '子任务详细描述' },
                dependencies: { type: 'array', items: { type: 'string' }, description: '依赖的前置子任务ID列表' },
                estimatedSteps: { type: 'integer', description: '预估步骤数' }
              },
              required: ['id', 'name', 'description']
            },
            description: '拆解后的子任务列表'
          },
          isComplex: { type: 'boolean', description: '是否为复杂任务', default: true },
          strategy: { type: 'string', enum: ['sequential', 'parallel', 'conditional'], description: '执行策略', default: 'sequential' }
        },
        required: ['taskDescription', 'subtasks']
      }
    }
  },
{
    id: 'search_conversation_memory',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'search_conversation_memory',
      description: '搜索历史对话记录',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或语义描述' },
          maxResults: { type: 'integer', description: '最大返回条数，默认5', default: 5 },
          searchScope: { type: 'string', enum: ['current_session', 'all_sessions'], description: '搜索范围' }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'preview_ui_prototype',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'preview_ui_prototype',
      description: 'UI原型预览（创建/获取HTML原型）',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['preview', 'get'], description: '操作类型', default: 'preview' },
          html: { type: 'string', description: '完整HTML代码（action=preview时需要）' },
          title: { type: 'string', description: '原型标题（action=preview时需要）' },
          description: { type: 'string', description: '原型说明（可选）' },
          prototypeId: { type: 'string', description: '原型ID（action=get时需要）' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'dispatch_sub_agent',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'dispatch_sub_agent',
      description: '将子任务分派给子Agent执行',
      parameters: {
        type: 'object',
        properties: {
          subAgentId: { type: 'string', description: '子Agent的ID' },
          task: { type: 'string', description: '分派给子Agent的完整任务描述' }
        },
        required: ['subAgentId', 'task']
      }
    }
  },
];
