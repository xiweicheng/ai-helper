import { BUILTIN_TOOLS_UI, CATEGORY_ORDER as _CATEGORY_ORDER } from '../background/constants.js';

export { BUILTIN_TOOLS_UI as BUILTIN_TOOLS };
export const CATEGORY_ORDER = [...new Set([..._CATEGORY_ORDER, 'mcp'])];

export const PRESET_MODES = [
  { label: "精准编码", temp: 0.2, topP: 1.0, tip: "较低随机性，适合业务开发、调试、纠错" },
  { label: "均衡开发", temp: 0.45, topP: 0.9, tip: "兼顾稳定性，用于封装工具类、常规脚本" },
  { label: "架构探索", temp: 0.65, topP: 0.9, tip: "提供多种实现思路，用于组件重构、方案对比" },
  { label: "创意发散", temp: 0.9, topP: 0.9, tip: "随机性较高，仅用于原型探索，不建议生产代码" }
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