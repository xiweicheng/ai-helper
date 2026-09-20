// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach } from 'vitest';
import { parseModelsPayload, fetchModelList, FetchModelsError } from '../../src/options/model-fetcher.js';

describe('parseModelsPayload', () => {
  test('OpenAI 标准 data[].id', () => {
    const json = { object: 'list', data: [{ id: 'gpt-4o', object: 'model' }, { id: 'gpt-3.5' }] };
    expect(parseModelsPayload(json)).toEqual(['gpt-4o', 'gpt-3.5']);
  });

  test('data[] 为字符串数组', () => {
    expect(parseModelsPayload({ data: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  test('models[] 字符串 / .id / .name', () => {
    expect(parseModelsPayload({ models: ['x', 'y'] })).toEqual(['x', 'y']);
    expect(parseModelsPayload({ models: [{ id: 'm1' }, { name: 'm2' }] })).toEqual(['m1', 'm2']);
  });

  test('Anthropic data[].id', () => {
    const json = { data: [{ type: 'model', id: 'claude-3-5-sonnet' }] };
    expect(parseModelsPayload(json)).toEqual(['claude-3-5-sonnet']);
  });

  test('去重与过滤空字符串', () => {
    const json = { data: [{ id: 'a' }, { id: 'a' }, { id: '' }, { id: '  b ' }] };
    expect(parseModelsPayload(json)).toEqual(['a', 'b']);
  });

  test('非法/空/缺字段返回空数组', () => {
    expect(parseModelsPayload(null)).toEqual([]);
    expect(parseModelsPayload({})).toEqual([]);
    expect(parseModelsPayload({ data: 'not-array' })).toEqual([]);
    expect(parseModelsPayload([])).toEqual([]);
  });
});

describe('fetchModelList', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function stubFetch(impl) { vi.stubGlobal('fetch', vi.fn(impl)); }

  test('缺少 apiBase/apiKey 抛 invalid-config', async () => {
    await expect(fetchModelList({ apiBase: '', apiKey: 'k' }))
      .rejects.toMatchObject({ reason: 'invalid-config' });
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: '' }))
      .rejects.toMatchObject({ reason: 'invalid-config' });
  });

  test('拼接 /models 并去除尾部斜杠', async () => {
    let calledUrl = '';
    stubFetch(async (url) => { calledUrl = url; return { ok: true, json: async () => ({ data: [{ id: 'm' }] }) }; });
    await fetchModelList({ apiBase: 'https://api.deepseek.com/', apiKey: 'k' });
    expect(calledUrl).toBe('https://api.deepseek.com/models');
  });

  test('通用请求头 Authorization Bearer', async () => {
    let headers = null;
    stubFetch(async (_url, opts) => { headers = opts.headers; return { ok: true, json: async () => ({ data: [{ id: 'm' }] }) }; });
    await fetchModelList({ apiBase: 'https://api.siliconflow.cn/v1', apiKey: 'sk-1' });
    expect(headers['Authorization']).toBe('Bearer sk-1');
    expect(headers['x-api-key']).toBeUndefined();
  });

  test('anthropic.com 追加 x-api-key 与 anthropic-version', async () => {
    let headers = null;
    stubFetch(async (_url, opts) => { headers = opts.headers; return { ok: true, json: async () => ({ data: [{ id: 'claude' }] }) }; });
    await fetchModelList({ apiBase: 'https://api.anthropic.com/v1', apiKey: 'ak' });
    expect(headers['x-api-key']).toBe('ak');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  test('HTTP 非 2xx 抛错并保留 status', async () => {
    stubFetch(async () => ({ ok: false, status: 401 }));
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: 'k' }))
      .rejects.toMatchObject({ status: 401, reason: 'http' });
  });

  test('解析为空抛 parse 错误', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ foo: 'bar' }) }));
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: 'k' }))
      .rejects.toMatchObject({ reason: 'parse' });
  });

  test('超时抛 timeout 错误', async () => {
    stubFetch(async (_url, opts) => new Promise((_res, rej) => {
      opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    }));
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: 'k', timeoutMs: 10 }))
      .rejects.toMatchObject({ reason: 'timeout' });
  });

  test('成功返回模型名数组', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ data: [{ id: 'a' }, { id: 'b' }] }) }));
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: 'k' })).resolves.toEqual(['a', 'b']);
  });

  test('FetchModelsError 是 Error 实例', () => {
    expect(new FetchModelsError('x', { reason: 'network' })).toBeInstanceOf(Error);
  });
});
