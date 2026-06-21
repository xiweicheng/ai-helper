import { BUILTIN_TOOLS_UI } from '../background/constants.js';

export { BUILTIN_TOOLS_UI as BUILTIN_TOOLS };

export const PRESET_MODES = [
  { label: "精准编码", temp: 0.2, topP: 1.0, tip: "较低随机性，适合业务开发、调试、纠错" },
  { label: "均衡开发", temp: 0.45, topP: 0.9, tip: "兼顾稳定性，用于封装工具类、常规脚本" },
  { label: "架构探索", temp: 0.65, topP: 0.9, tip: "提供多种实现思路，用于组件重构、方案对比" },
  { label: "创意发散", temp: 0.9, topP: 0.9, tip: "随机性较高，仅用于原型探索，不建议生产代码" }
];

export const TOOL_CATEGORY_NAMES = {
    'page_interaction': '🖱️ 页面交互',
    'form_operation': '📝 表单操作',
    'info_extract': '📄 信息提取',
    'page_analysis': '🔍 页面分析',
    'tab_management': '📑 标签页管理',
    'bookmark_history': '🔖 书签历史',
    'storage_management': '💾 存储管理',
    'network_request': '🌐 网络请求',
    'media_process': '📷 媒体处理',
    'debug_dev': '🔧 调试开发',
    'ai_collaboration': '🤖 AI协作',
    'system_integration': '⚙️ 系统集成'
};

export const CATEGORY_ORDER = ['page_interaction', 'form_operation', 'info_extract', 'page_analysis', 
                     'tab_management', 'bookmark_history', 'storage_management', 
                     'network_request', 'media_process', 'debug_dev', 'ai_collaboration', 'system_integration'];
