// options/model-fetcher.js - 从厂商 API 拉取模型列表
// 单一职责：请求 + 容错解析。写入下拉与 toast 由 index.js 负责。

/**
 * 容错解析厂商返回的模型列表，兼容多种格式。
 * 依次尝试 data[] / models[]，元素可为字符串或含 id/name/model 的对象。
 * @param {any} json
 * @returns {string[]} 去重、过滤空后的模型名数组
 */
export function parseModelsPayload(json) {
  if (!json || typeof json !== 'object') return [];
  const arr = Array.isArray(json.data) ? json.data
    : Array.isArray(json.models) ? json.models
    : null;
  if (!arr) return [];

  const seen = new Set();
  const result = [];
  for (const item of arr) {
    let name = '';
    if (typeof item === 'string') {
      name = item;
    } else if (item && typeof item === 'object') {
      const id = item.id || item.name || item.model;
      if (typeof id === 'string') name = id;
    }
    name = (name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}
