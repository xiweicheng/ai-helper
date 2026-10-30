// shared/tools.js - 从主定义派生，单一数据源
// 注意：当前实际消费点为 src/side_panel/constants.js（直接从 background/constants.js 派生）。
// 本文件保留作为共享定义参考，文案统一走 i18n（t('toolCategory.<id>') / t('presetMode.<key>')）。
import { BUILTIN_TOOLS_UI, CATEGORY_ORDER } from '../background/constants.js';

export { BUILTIN_TOOLS_UI as BUILTIN_TOOLS };

// 从 CATEGORY_ORDER 动态派生 TOOL_CATEGORIES（单一数据源）
// label 走 i18n：t('toolCategory.<id>')；'all' 走 t('toolPanel.categoryAll')
export const TOOL_CATEGORIES = [
  { id: 'all', labelKey: 'toolPanel.categoryAll' },
  ...CATEGORY_ORDER.map(id => ({ id, labelKey: `toolCategory.${id}` }))
];

// 预设温度档位：labelKey/tipKey 对应 locales 中的 presetMode 模块
export const PRESET_MODES = [
  { labelKey: 'presetMode.preciseLabel', tipKey: 'presetMode.preciseTip', temp: 0.2, topP: 1.0 },
  { labelKey: 'presetMode.generalLabel', tipKey: 'presetMode.generalTip', temp: 0.45, topP: 0.9 },
  { labelKey: 'presetMode.divergentLabel', tipKey: 'presetMode.divergentTip', temp: 0.65, topP: 0.9 },
  { labelKey: 'presetMode.creativeLabel', tipKey: 'presetMode.creativeTip', temp: 0.9, topP: 0.9 },
];

export const DEFAULT_CHAT_CONFIG = {
  maxMemoryMessages: 20,
};

// 直接从 background/constants.js 派生（单一数据源）：这里曾复制过一份默认值，
// 放宽时限时两边不同步就变成第二套「事实」，读代码的人无从判断哪个生效
export { DEFAULT_REACT_CONFIG } from '../background/constants.js';

export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-pro';
