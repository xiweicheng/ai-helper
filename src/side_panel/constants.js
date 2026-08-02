import { BUILTIN_TOOLS_UI, CATEGORY_ORDER as _CATEGORY_ORDER } from '../background/constants.js';

export { BUILTIN_TOOLS_UI as BUILTIN_TOOLS };
export const CATEGORY_ORDER = [...new Set([..._CATEGORY_ORDER, 'mcp'])];

// 预设温度档位：labelKey/tipKey 对应 locales 中的 presetMode 模块
export const PRESET_MODES = [
  { labelKey: 'presetMode.preciseLabel', tipKey: 'presetMode.preciseTip', temp: 0.2, topP: 1.0 },
  { labelKey: 'presetMode.generalLabel', tipKey: 'presetMode.generalTip', temp: 0.45, topP: 0.9 },
  { labelKey: 'presetMode.divergentLabel', tipKey: 'presetMode.divergentTip', temp: 0.65, topP: 0.9 },
  { labelKey: 'presetMode.creativeLabel', tipKey: 'presetMode.creativeTip', temp: 0.9, topP: 0.9 }
];

// 工具分类名称：通过 t('toolCategory.<category>') 获取本地化名称
// 此映射保留作为分类 key 列表参考；显示文案统一走 i18n
export const TOOL_CATEGORY_NAMES = {
    'page_interaction': 'page_interaction',
    'form_operation': 'form_operation',
    'content_extraction': 'content_extraction',
    'tab_management': 'tab_management',
    'bookmark_history': 'bookmark_history',
    'storage_management': 'storage_management',
    'network_request': 'network_request',
    'media_output': 'media_output',
    'debug_dev': 'debug_dev',
    'ai_collaboration': 'ai_collaboration',
    'local_agent': 'local_agent',
    'mcp': 'mcp'
};
