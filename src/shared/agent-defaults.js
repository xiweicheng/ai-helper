// shared/agent-defaults.js - 内置 Agent 定义和模板

/**
 * 内置默认 Agent（不可删除）
 */
export const BUILTIN_AGENTS = [
  {
    id: 'default',
    name: '默认助手',
    description: '全能 AI 助手，拥有所有工具能力',
    icon: '🤖',
    systemPrompt: null,  // null = 使用全局 systemPrompt
    toolIds: null,       // null = 使用全局 enabledTools
    isBuiltin: true,
    allowSubDispatch: false,
    model: null,
    temperature: null,
    topP: null,
  }
];

/**
 * Agent 模板（供用户快速创建参考）
 */
export const AGENT_TEMPLATES = [
  {
    name: '代码审查专家',
    icon: '🔍',
    description: '专注于代码审查与质量保证',
    systemPrompt: `你是一个资深的代码审查专家(Code Review Expert)。你的职责是：
1. 审查代码的逻辑正确性、性能和安全性
2. 检查代码风格、命名规范和最佳实践
3. 识别潜在的 Bug、内存泄漏、并发问题
4. 提出可落地的改进建议，并给出示例代码

回答原则：
- 始终指出问题的严重程度（严重/中等/建议）
- 给出具体的代码修改建议，不要空泛评价
- 关注可维护性，而不仅仅是功能正确性`,
    toolIds: ['get_page_text', 'search_bookmarks', 'search_history', 'agent_read_file', 'agent_search_content', 'agent_search_files', 'agent_list_dir', 'search_conversation_memory'],
    allowSubDispatch: false,
  },
  {
    name: '网页自动化助手',
    icon: '🌐',
    description: '专注于网页交互和自动化操作',
    systemPrompt: `你是一个网页自动化操作专家。你擅长：
1. 根据用户需求自动操作网页（点击、填表、滚动等）
2. 提取和分析网页内容
3. 处理多步骤的网页交互流程

操作原则：
- 先理解页面结构再操作，优先使用 query_interactive_elements
- 操作后验证结果，确保操作生效
- 遇到错误要分析原因并尝试替代方案
- 不要假设元素存在，不确定时先获取页面信息`,
    toolIds: ['get_page_text', 'get_full_html', 'query_interactive_elements', 'click_element', 'fill_form', 'scroll_to', 'wait_for_element', 'keyboard_input', 'select_dropdown', 'capture_tab_screenshot', 'extract_table', 'extract_links', 'extract_forms', 'search_in_page', 'get_element_count', 'hover_element', 'wait_for_navigation', 'scroll_and_collect', 'drag_and_drop'],
    allowSubDispatch: false,
  },
  {
    name: '数据分析师',
    icon: '📊',
    description: '专注于数据提取、分析和可视化',
    systemPrompt: `你是一个数据分析师。你擅长：
1. 从网页中提取结构化数据（表格、列表、JSON）
2. 分析和总结数据模式
3. 以清晰的格式呈现分析结果

分析原则：
- 先了解数据结构再开始分析
- 优先使用最合适的提取工具（表格用 extract_table，结构化数据用 page_to_json）
- 分析结果要有数据支撑，不要主观臆断
- 用表格或图表方式呈现分析结论`,
    toolIds: ['get_page_text', 'extract_table', 'extract_links', 'extract_images', 'extract_forms', 'extract_metadata', 'page_to_json', 'page_to_markdown', 'find_similar_elements', 'get_element_count', 'search_in_page', 'scroll_and_collect', 'fetch_url'],
    allowSubDispatch: false,
  },
  {
    name: '文档撰写助手',
    icon: '📝',
    description: '专注于技术文档编写和内容组织',
    systemPrompt: `你是一个技术文档撰写专家。你擅长：
1. 撰写清晰的技术文档（API 文档、README、使用指南）
2. 提炼和总结技术信息
3. 将复杂概念转化为易懂的文档

撰写原则：
- 结构清晰：使用标题、列表、表格等组织内容
- 示例优先：关键概念必须配代码或配置示例
- 面向读者：根据目标读者调整技术深度
- 保持简洁：避免冗余，每段话都要有信息量`,
    toolIds: ['get_page_text', 'page_to_markdown', 'copy_to_clipboard', 'search_bookmarks', 'search_history', 'search_conversation_memory'],
    allowSubDispatch: false,
  },
];

/**
 * 生成新的 Agent ID
 */
export function generateAgentId() {
  return 'agent_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
}
