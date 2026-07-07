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
      description: '当需要进一步澄清用户的问题或任务时调用此工具。该工具会弹出界面让用户从3-5个建议选项中选择，或自定义输入内容，并支持补充说明。适用于信息不完整、存在歧义或需要确认细节的场景',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '需要澄清的问题或主题'
          },
          options: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: '3-5个供用户选择的建议选项'
          },
          recommendedOption: {
            type: 'integer',
            description: '模型推荐优先选择的选项索引（从0开始），该选项会被标记为推荐并默认选中，必填'
          },
          allowCustomInput: {
            type: 'boolean',
            description: '是否允许用户自定义输入（默认true）',
            default: true
          },
          allowAdditionalInfo: {
            type: 'boolean',
            description: '是否允许用户提供补充信息（默认true）',
            default: true
          }
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
      description: '在页面上高亮显示指定文本。用于AI回答后定位原文、标记重要内容',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '要高亮的文本内容'
          },
          color: {
            type: 'string',
            description: '高亮颜色，支持颜色名或hex值',
            default: 'yellow'
          }
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
      description: '任务规划与拆解工具。当遇到复杂任务时，先调用此工具进行任务拆解，将大任务分解为多个独立的子任务，并为每个子任务筛选所需的工具集。',
      parameters: {
        type: 'object',
        properties: {
          taskDescription: {
            type: 'string',
            description: '原始任务描述'
          },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: '子任务ID'
                },
                name: {
                  type: 'string',
                  description: '子任务名称'
                },
                description: {
                  type: 'string',
                  description: '子任务详细描述'
                },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '依赖的前置子任务ID列表'
                },
                requiredTools: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '此子任务需要的工具名称列表（如：get_page_text, click_element, fill_form 等）。必须明确指定，否则子任务将无法使用任何工具。'
                },
                estimatedSteps: {
                  type: 'integer',
                  description: '预估需要的步骤数'
                }
              },
              required: ['id', 'name', 'description', 'requiredTools']
            },
            description: '拆解后的子任务列表'
          },
          isComplex: {
            type: 'boolean',
            description: '是否为复杂任务（需要拆解）',
            default: true
          },
          strategy: {
            type: 'string',
            description: '执行策略：sequential（顺序执行）、parallel（并行执行）、conditional（条件执行）',
            enum: ['sequential', 'parallel', 'conditional'],
            default: 'sequential'
          }
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
      description: '搜索之前的对话记录。当你需要回顾用户之前提到过的信息、之前的决策、或者用户说"之前聊过""上次说的""记得之前"等内容时，应主动调用此工具检索相关上下文。当用户的问题涉及之前讨论过的内容、你需要回顾历史上下文才能准确回答时，也请使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或自然语言描述，用于匹配历史对话内容。可以是具体的关键词，也可以是语义描述'
          },
          maxResults: {
            type: 'integer',
            description: '最多返回多少条相关消息，默认为5',
            default: 5
          },
          searchScope: {
            type: 'string',
            description: '搜索范围：current_session（仅当前会话）或 all_sessions（所有历史会话），默认 current_session',
            enum: ['current_session', 'all_sessions']
          }
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
      description: 'UI 原型预览和管理工具。action=preview：传入HTML代码创建并预览原型，返回prototypeId；action=get：根据prototypeId获取之前创建的原型完整代码，用于修改后再预览。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['preview', 'get'],
            description: '操作类型：preview（创建并预览原型，默认）、get（根据 prototypeId 获取原型代码）',
            default: 'preview'
          },
          html: {
            type: 'string',
            description: '完整的 HTML 代码（包含内联的 CSS 和 JS），仅 action=preview 时需要'
          },
          title: {
            type: 'string',
            description: '原型的标题/名称，仅 action=preview 时需要'
          },
          description: {
            type: 'string',
            description: '原型的简要说明，可选'
          },
          prototypeId: {
            type: 'string',
            description: '原型 ID，格式为 proto_xxxxxxxxxxxxx，仅 action=get 时需要'
          }
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
      description: '将子任务分派给指定的子 Agent 执行。子 Agent 拥有独立的角色定义和工具集。当你需要不同领域的专业能力处理子任务时使用此工具（如代码审查+文档撰写）。可在一次响应中并行调用多个 dispatch_sub_agent，每个子 Agent 独立执行。',
      parameters: {
        type: 'object',
        properties: {
          subAgentId: {
            type: 'string',
            description: '子 Agent 的 ID。可用的子 Agent 列表会在系统提示词中提供。'
          },
          task: {
            type: 'string',
            description: '要分派给子 Agent 的完整任务描述，包括所有必要的上下文信息。子 Agent 只会看到这个任务描述和其自身的系统提示词，无法访问主对话历史。请确保任务描述足够详细完整。'
          }
        },
        required: ['subAgentId', 'task']
      }
    }
  },
];
