import { BUILTIN_TOOLS_UI, CATEGORY_ORDER as _CATEGORY_ORDER } from '../background/constants.js';

export { BUILTIN_TOOLS_UI as BUILTIN_TOOLS };
export const CATEGORY_ORDER = [...new Set([..._CATEGORY_ORDER, 'mcp'])];

export const PRESET_MODES = [
  { label: "精准严谨", temp: 0.2, topP: 1.0, tip: "改错、调试、要准确答案（低随机性，适合修 bug）" },
  { label: "日常通用", temp: 0.45, topP: 0.9, tip: "多数场景都好用（平衡稳定与灵活，适合写脚本）" },
  { label: "思路发散", temp: 0.65, topP: 0.9, tip: "要多种方案做对比（适合重构、方案对比）" },
  { label: "创意脑暴", temp: 0.9, topP: 0.9, tip: "写文案、起名、头脑风暴（高随机性，不建议正式代码）" }
];

export const TOOL_CATEGORY_NAMES = {
    'page_interaction': '🖱️ 页面交互',
    'form_operation': '📝 表单操作',
    'content_extraction': '📄 内容提取',
    'tab_management': '📑 标签页管理',
    'bookmark_history': '🔖 书签历史',
    'storage_management': '💾 存储管理',
    'network_request': '🌐 网络请求',
    'media_output': '📷 媒体与输出',
    'debug_dev': '🔧 调试开发',
    'ai_collaboration': '🤖 AI协作',
    'local_agent': '🖥️ 代理',
    'mcp': '🔌 MCP'
};