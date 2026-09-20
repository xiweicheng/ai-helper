// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { parseModelsPayload } from '../../src/options/model-fetcher.js';

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
