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
      description: '通过本地 Agent 读取本地文件系统的文件内容。需要先在设置中完成 Agent 配对，确保代理服务正在运行。只能读取 Agent 工作目录及其白名单目录内的文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径或相对于工作目录的路径'
          }
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
      description: '通过本地 Agent 将内容写入本地文件系统的文件。会覆盖已有文件或创建新文件。需要先配对 Agent，只能写入 Agent 工作目录及其白名单目录内的文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件的绝对路径或相对于工作目录的路径'
          },
          content: {
            type: 'string',
            description: '要写入的文件内容'
          }
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
      description: '通过本地 Agent 列出本地文件系统目录的内容（文件和子目录）。需要先配对 Agent。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目录的绝对路径或相对于工作目录的路径，默认为当前工作目录',
            default: '.'
          }
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
      description: '通过本地 Agent 删除本地文件系统的文件或目录。需要先配对 Agent。这是不可逆操作，删除的文件无法从回收站恢复。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要删除的文件或目录路径'
          }
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
    requiresConfirmation: true,
    type: 'function',
    function: {
      name: 'agent_exec_command',
      description: '通过本地 Agent 执行系统命令。适用场景：npm install、git 操作、运行脚本、编译构建等。危险命令（如 rm -rf /）会被自动拦截。敏感命令（如 sudo、全局安装 npm 包、chmod 777、git push --force 等）初次调用时会返回确认提示，你需要告知用户需要确认的原因，等待用户同意后，再次调用此工具并传入 force: true 来强制执行。命令的输出和退出码会完整返回。\n\n注意：请根据系统提示词中的「命令执行环境」信息生成对应操作系统的命令（Windows 使用 PowerShell，Linux/macOS 使用 Unix 命令）。对于长时间运行的命令（如大型项目构建、模型下载），可以通过 timeout 参数指定更长的超时时间。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的系统命令，如 "npm install", "git status", "ls -la" 等'
          },
          cwd: {
            type: 'string',
            description: '命令执行的工作目录（可选），默认为 Agent 的工作目录'
          },
          force: {
            type: 'boolean',
            description: '设为 true 强制执行已被用户确认的命令。仅在用户明确同意执行后再使用。默认为 false。'
          },
          timeout: {
            type: 'integer',
            description: '命令执行超时时间（毫秒）。默认 600000ms（10分钟）。对于长时间运行的命令，如大型项目构建、模型下载等，可以设置更长的超时时间，例如 1800000ms（30分钟）。'
          }
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
      description: '通过本地 Agent 按文件名模式搜索文件。支持 glob 模式（如 "*.js"、"test*.ts"）。优先使用 fd 命令（如已安装），否则使用 Node.js 原生递归搜索。自动跳过 node_modules、.git 等目录。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '搜索根目录路径'
          },
          pattern: {
            type: 'string',
            description: '文件名匹配模式，支持 glob，如 "*.js"、"test*.ts"、"*.{json,md}"。默认为 "*" (匹配所有文件)'
          },
          recursive: {
            type: 'boolean',
            description: '是否递归搜索子目录，默认 true'
          },
          maxResults: {
            type: 'integer',
            description: '最大返回结果数，默认 200'
          }
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
      description: '通过本地 Agent 在文件中搜索文本内容。优先使用 ripgrep (rg) 命令（如已安装），否则使用 Node.js 原生搜索。自动跳过 node_modules、.git、二进制文件等。返回匹配行及上下文。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '搜索根目录路径'
          },
          pattern: {
            type: 'string',
            description: '要搜索的文本内容（纯文本匹配，非正则）'
          },
          filePattern: {
            type: 'string',
            description: '可选：限制搜索的文件类型，如 "*.js"、"*.{ts,tsx}"。不传则搜索所有文本文件'
          },
          caseSensitive: {
            type: 'boolean',
            description: '是否大小写敏感，默认 false（不区分大小写）'
          },
          maxResults: {
            type: 'integer',
            description: '最大返回结果数，默认 100'
          },
          contextLines: {
            type: 'integer',
            description: '每条匹配结果附带的上下文行数，默认 2'
          }
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
      description: '按需加载一个 Agent Skill 的完整说明文档。当系统提示词中的技能列表表明某个技能匹配用户需求时，使用此工具加载其完整内容（SKILL.md），然后严格按照技能文档中的指示执行。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '要加载的 Agent Skill 名称。名称可在系统提示词的"可用技能 (Skills)"列表中查看。'
          }
        },
        required: ['name']
      }
    }
  },
  {
    id: 'agent_skill_run',
    category: 'local_agent',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'agent_skill_run',
      description: '执行一个预定义的 Workflow Skill（技能流程）。Workflow Skill 是封装了多步操作的可复用自动化流程，通过 JSON 定义步骤和依赖关系。\n\n注意：Agent Skill（Markdown 格式的技能）不需要通过此工具调用——它们已在系统提示词中提供，AI 可以直接按照 Skill 描述自主执行。只有 Workflow Skill 需要通过此工具触发执行。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Skill 名称。例如: create-react-component, git-conventional-commit'
          },
          params: {
            type: 'object',
            description: 'Skill 所需的参数对象。具体参数取决于 Skill 定义。'
          }
        },
        required: ['name']
      }
    }
  },
];
