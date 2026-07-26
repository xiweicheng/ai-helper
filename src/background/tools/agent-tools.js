// agent-tools - local agent 工具定义

export const AGENT_TOOLS = [
  {
    id: 'agent_read_file',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_read_file',
      description: '通过本地Agent读取文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' }
        },
        required: ['path']
      }
    }
  },
  {
    id: 'agent_write_file',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_write_file',
      description: '通过本地Agent写入文件',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '要写入的文件内容' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    id: 'agent_list_dir',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_list_dir',
      description: '通过本地Agent列出目录内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，默认当前工作目录', default: '.' }
        },
        required: []
      }
    }
  },
  {
    id: 'agent_delete_file',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'agent_delete_file',
      description: '通过本地Agent删除文件或目录',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要删除的文件或目录路径' }
        },
        required: ['path']
      }
    }
  },
  // ── 合并后的回收站管理工具 ──
  {
    id: 'agent_trash',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,  // restore 非并行，保守取 false
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_trash',
      description: '回收站管理：列出/恢复已删除文件',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'restore'], description: '操作类型：list=列出回收站文件，restore=恢复文件' },
          trashId: { type: 'string', description: '回收站条目ID（action=restore时需要，来自list结果）' },
          hours: { type: 'number', description: '仅返回最近N小时内删除的文件（action=list时可选），不传则返回全部' }
        },
        required: ['action']
      }
    }
  },
  {
    id: 'agent_download_file',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_download_file',
      description: '通过本地Agent下载工作目录下的文件或目录',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要下载的文件或目录路径' }
        },
        required: ['path']
      }
    }
  },
  {
    id: 'agent_exec_command',
    category: 'local_agent',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_exec_command',
      description: '执行系统命令（危险命令拦截，敏感命令需确认）',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的系统命令' },
          cwd: { type: 'string', description: '工作目录（可选）' },
          force: { type: 'boolean', description: '设为true强制执行已确认的命令' },
          timeout: { type: 'integer', description: '超时（ms），默认600000（10分钟）' }
        },
        required: ['command']
      }
    }
  },
  {
    id: 'agent_search_files',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_search_files',
      description: '按文件名模式搜索文件（glob）',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '搜索根目录' },
          pattern: { type: 'string', description: '文件名glob模式，如"*.js"' },
          recursive: { type: 'boolean', description: '递归搜索子目录', default: true },
          maxResults: { type: 'integer', description: '最大结果数，默认200' }
        },
        required: ['path']
      }
    }
  },
  {
    id: 'agent_search_content',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_search_content',
      description: '在文件中搜索文本内容（ripgrep）',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '搜索根目录' },
          pattern: { type: 'string', description: '要搜索的文本（纯文本匹配）' },
          filePattern: { type: 'string', description: '限定文件类型，如"*.js"' },
          caseSensitive: { type: 'boolean', description: '大小写敏感', default: false },
          maxResults: { type: 'integer', description: '最大结果数，默认100' },
          contextLines: { type: 'integer', description: '上下文行数，默认2' }
        },
        required: ['path', 'pattern']
      }
    }
  },
  {
    id: 'agent_skill_load',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_skill_load',
      description: '加载 Agent Skill（SKILL.md 类型）的完整说明文档',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill名称' }
        },
        required: ['name']
      }
    }
  },
  {
    id: 'agent_workflow_run',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_workflow_run',
      description: '执行 Workflow Skill（JSON/YAML 格式）的确定性自动化流程',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill名称' },
          params: { type: 'object', description: 'Skill所需参数' }
        },
        required: ['name']
      }
    }
  },
  // ── 合并后的 AI 代理管理工具 ──
  {
    id: 'manage_agent',
    category: 'ai_collaboration',
    execution: 'background',
    parallelizable: false,  // switch 非并行，保守取 false
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'manage_agent',
      description: 'AI代理管理：查询已配对代理列表或切换活跃代理',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'switch'], description: '操作类型：list=查询代理列表及状态，switch=切换活跃代理' },
          agentId: { type: 'string', description: '代理ID（action=switch时需要，从list结果获取）' },
          agentName: { type: 'string', description: '代理名称（action=switch时模糊匹配）' }
        },
        required: ['action']
      }
    }
  },
];
