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

/** 拉取模型失败错误，保留 HTTP 状态码与失败原因 */
export class FetchModelsError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.name = 'FetchModelsError';
    this.status = status;   // HTTP 状态码（若有）
    this.reason = reason;   // 'timeout'|'network'|'http'|'parse'|'invalid-config'
  }
}

function buildModelsUrl(apiBase) {
  return `${String(apiBase).trim().replace(/\/+$/, '')}/models`;
}

function isAnthropic(apiBase) {
  return /anthropic\.com/i.test(String(apiBase || ''));
}

/**
 * 请求厂商 /models 接口并解析模型名列表。
 * @param {{apiBase:string, apiKey:string, timeoutMs?:number}} opts
 * @returns {Promise<string[]>}
 * @throws {FetchModelsError}
 */
export async function fetchModelList({ apiBase, apiKey, timeoutMs = 15000 } = {}) {
  const base = (apiBase || '').trim();
  const key = (apiKey || '').trim();
  if (!base || !key) {
    throw new FetchModelsError('missing apiBase or apiKey', { reason: 'invalid-config' });
  }

  const headers = { 'Authorization': `Bearer ${key}` };
  if (isAnthropic(base)) {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(buildModelsUrl(base), { method: 'GET', headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new FetchModelsError('request timeout', { reason: 'timeout' });
    }
    throw new FetchModelsError((err && err.message) || 'network error', { reason: 'network' });
  }
  clearTimeout(timer);

  if (!resp.ok) {
    throw new FetchModelsError(`HTTP ${resp.status}`, { status: resp.status, reason: 'http' });
  }

  let json;
  try {
    json = await resp.json();
  } catch (_e) {
    throw new FetchModelsError('invalid JSON', { reason: 'parse' });
  }

  const models = parseModelsPayload(json);
  if (!models.length) {
    throw new FetchModelsError('no models parsed', { reason: 'parse' });
  }
  return models;
}
