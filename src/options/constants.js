// options/constants.js - 常量定义

// 预设模型列表
export const PRESET_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash'
];

// 默认系统提示词
export const DEFAULT_SYSTEM_PROMPT = `你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理`;

// ReAct 配置默认值
export const DEFAULT_REACT_CONFIG = {
  maxIterations: 5,
  apiTimeout: 60000,
  loopTimeout: 300000,
  toolTimeout: 30000,
  clarifyTimeout: 180000,
  apiRetryCount: 3,
  apiRetryBaseDelay: 1000
};

// 默认工具栏工具配置
export const DEFAULT_TOOLBAR_TOOLS = [
  { id: 'ai-search',  name: 'AI搜索', systemPrompt: '使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。', builtin: true, order: 0 },
  { id: 'explain',   name: '解释',   systemPrompt: '对选中的内容进行解释说明，帮助理解其含义。', builtin: true, order: 1 },
  { id: 'translate', name: '翻译',   systemPrompt: '将选中的内容翻译成中文。', builtin: true, order: 2 },
  { id: 'summary',   name: '总结',   systemPrompt: '对选中的内容进行归纳总结，提炼关键要点。', builtin: true, order: 3 },
  { id: 'copy',      name: '复制',   systemPrompt: '将选中内容复制到剪贴板。', builtin: true, order: 99 }
];

// 工具栏默认直接显示数量
export const DEFAULT_TOOLBAR_MAX_VISIBLE = 4;
export const DEFAULT_TOOLBAR_ICON_ONLY = false;
// 选中内容工具栏开关（独立于划词问答开关）
export const DEFAULT_ENABLE_SELECTION_TOOLBAR = true;

// 对话配置默认值
export const DEFAULT_CHAT_CONFIG = {
  maxInputHistory: 20,
  maxHistoryMessages: 50,
  maxMessageLength: 100000,
  maxMemoryMessages: null,   // 记忆历史限制条数，null表示不限制
  enableExecutionLog: false  // 默认关闭执行日志
};

// 反思配置默认值
export const DEFAULT_REFLECTION_CONFIG = {
  enabled: true,
  postReflection: {
    enabled: true,
    maxRounds: 1,
    qualityThreshold: 7,
    refineThreshold: 5,
    model: null,
    temperature: 0.3,
    maxTokens: 2048
  },
  subtaskReflection: {
    enabled: false,
    onlyForComplexSubtasks: true,
    maxRounds: 1,
    dimensions: ['completeness', 'relevance'],
    model: null,
    temperature: 0.3,
    maxTokens: 1024
  },
  toolReflection: {
    enabled: true,
    triggerOnError: true,
    triggerOnEmpty: true,
    triggerOnOversized: true,
    oversizeThreshold: 50000,
    triggerOnConsecutiveFails: 3,
    maxPerIteration: 2
  }
};
