// side_panel/agent-tool-filter.js - 助手编辑器工具列表的过滤纯函数
//
// 编辑器工具区块支持两种过滤（可叠加）：
// - query：按工具名 / 描述（展示口径，由调用方注入 getDesc）子串匹配；
//   MCP 服务额外匹配服务名 / 服务 ID / 服务内工具名
// - selectedOnly：只看已勾选（工具在 selectedSet 中；MCP 服务未被排除即开放）
//
// 纯函数不触碰 DOM 与 i18n，勾选状态集合由调用方（agent-manager 渲染缓存）传入
import { registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  agentToolFilter: {
    selectedCountHint: '已勾选 {count} 项',
  },
});
registerTranslations('en', {
  agentToolFilter: {
    selectedCountHint: '{count} selected',
  },
});

/**
 * 判断单个工具是否命中过滤条件
 * @param {{id: string, name?: string, description?: string}} tool
 * @param {object} opts
 * @param {string} opts.query 搜索词（内部大小写不敏感）
 * @param {boolean} opts.selectedOnly 只看已勾选
 * @param {Set<string>} opts.selectedSet 已勾选工具 ID 集合
 * @param {(tool: object) => string} [opts.getDesc] 展示描述解析（i18n 口径），缺省用 tool.description
 * @returns {boolean}
 */
export function matchesToolFilter(tool, { query, selectedOnly, selectedSet, getDesc }) {
  if (selectedOnly && !selectedSet.has(tool.id)) return false;
  const q = String(query || '').toLowerCase();
  if (!q) return true;
  const name = (tool.name || '').toLowerCase();
  if (name.includes(q)) return true;
  const desc = String((getDesc ? getDesc(tool) : tool.description) || '').toLowerCase();
  return desc.includes(q);
}

/**
 * 判断 MCP 服务行是否命中过滤条件（服务粒度）
 * @param {{serverId: string, serverName?: string, tools?: Array}} service
 * @param {object} opts
 * @param {string} opts.query 搜索词（内部大小写不敏感）
 * @param {boolean} opts.selectedOnly 只看已勾选（开放 = 未被排除）
 * @param {Set<string>} opts.excludedSet 已排除服务 ID 集合
 * @param {(tool: object) => string} [opts.getDesc] 服务内工具描述解析
 * @returns {boolean}
 */
export function matchesServiceFilter(service, { query, selectedOnly, excludedSet, getDesc }) {
  if (selectedOnly && excludedSet.has(service.serverId)) return false;
  const q = String(query || '').toLowerCase();
  if (!q) return true;
  const haystack = [service.serverName, service.serverId]
    .filter(Boolean).join(' ').toLowerCase();
  if (haystack.includes(q)) return true;
  return (service.tools || []).some(tw => {
    if ((tw.name || '').toLowerCase().includes(q)) return true;
    const desc = String((getDesc ? getDesc(tw) : tw.description) || '').toLowerCase();
    return desc.includes(q);
  });
}

/**
 * 对工具与 MCP 服务行应用搜索 + 只看已勾选过滤（两种过滤可叠加）
 * @param {object} input
 * @param {Array} input.tools 全量常规工具（内置 + RAG）
 * @param {Array} input.services 全量 MCP 服务行
 * @param {Set<string>} input.selectedSet 已勾选工具 ID 集合
 * @param {Set<string>} input.excludedSet 已排除 MCP 服务 ID 集合
 * @param {string} [input.query] 搜索词（大小写不敏感）
 * @param {boolean} [input.selectedOnly] 只看已勾选
 * @param {(tool: object) => string} [input.getDesc] 展示描述解析函数
 * @returns {{tools: Array, services: Array}} 过滤后的可见项（保持原顺序）
 */
export function filterAgentToolEntries({ tools, services, selectedSet, excludedSet, query, selectedOnly, getDesc }) {
  const q = String(query || '').trim().toLowerCase();
  const opts = { query: q, selectedOnly: selectedOnly === true, selectedSet, excludedSet, getDesc };
  return {
    tools: (tools || []).filter(t => matchesToolFilter(t, opts)),
    services: (services || []).filter(s => matchesServiceFilter(s, opts)),
  };
}
