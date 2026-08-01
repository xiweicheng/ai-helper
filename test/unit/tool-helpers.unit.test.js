// tool-helpers 单元测试：JSON 修复 / 参数解析 / 结果归一（纯函数，node 环境）
import { describe, test, expect } from 'vitest';
import {
  autoCompleteJson,
  fixArrayObjectMismatch,
  tryParseToolArgs,
  makeResult,
  normalizeToolResult,
} from '../../src/background/tool-helpers.js';

// ==================== autoCompleteJson ====================

describe('autoCompleteJson - 截断 JSON 补全', () => {
  test('完整 JSON 原样返回', () => {
    expect(autoCompleteJson('{"a":1}')).toBe('{"a":1}');
    expect(autoCompleteJson('[1,2,3]')).toBe('[1,2,3]');
  });

  test('未闭合的字符串补引号并补全外层括号', () => {
    // 字符串未闭合 → 补 "；外层对象未闭合 → 补 }
    expect(autoCompleteJson('{"a":"hello')).toBe('{"a":"hello"}');
  });

  test('未闭合的对象括号补全 }', () => {
    expect(autoCompleteJson('{"a":1')).toBe('{"a":1}');
  });

  test('未闭合的数组括号补全 ]}', () => {
    expect(autoCompleteJson('{"a":[1,2')).toBe('{"a":[1,2]}');
  });

  test('尾随逗号被移除后再补全括号', () => {
    expect(autoCompleteJson('{"a":1,')).toBe('{"a":1}');
  });

  test('嵌套未闭合：补全内层和外层括号', () => {
    expect(autoCompleteJson('{"a":{"b":"x')).toBe('{"a":{"b":"x"}}');
  });

  test('转义引号不影响引号状态跟踪', () => {
    // \" 是转义引号，不应切换 inString；最终补 " 和 }
    expect(autoCompleteJson('{"a":"he said \\"hi')).toBe('{"a":"he said \\"hi"}');
  });

  test('非字符串输入原样返回', () => {
    expect(autoCompleteJson(null)).toBeNull();
    expect(autoCompleteJson(undefined)).toBeUndefined();
    expect(autoCompleteJson('')).toBe('');
    expect(autoCompleteJson(123)).toBe(123);
  });
});

// ==================== fixArrayObjectMismatch ====================

describe('fixArrayObjectMismatch - 清除数组中混入的 KV', () => {
  test('数组中混入 "key": value 被移除', () => {
    expect(fixArrayObjectMismatch('["a", "key": 1, "b"]')).toBe('["a", "b"]');
  });

  test('数字 key 的 KV 也被移除', () => {
    expect(fixArrayObjectMismatch('[1, "x": 2, 3]')).toBe('[1, 3]');
  });

  test('正常数组不变', () => {
    expect(fixArrayObjectMismatch('["a", "b", "c"]')).toBe('["a", "b", "c"]');
  });

  test('对象内正常 KV 不受影响', () => {
    expect(fixArrayObjectMismatch('{"a": 1, "b": 2}')).toBe('{"a": 1, "b": 2}');
  });

  test('数组中的对象元素不变', () => {
    expect(fixArrayObjectMismatch('[{"a":1}, {"b":2}]')).toBe('[{"a":1}, {"b":2}]');
  });

  test('非字符串输入原样返回', () => {
    expect(fixArrayObjectMismatch(null)).toBeNull();
    expect(fixArrayObjectMismatch('')).toBe('');
  });
});

// ==================== tryParseToolArgs ====================

describe('tryParseToolArgs - 工具参数解析', () => {
  test('合法 JSON 直通', () => {
    expect(tryParseToolArgs('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseToolArgs('[1,2,3]')).toEqual([1, 2, 3]);
  });

  test('数字/布尔值直通', () => {
    expect(tryParseToolArgs('123')).toBe(123);
    expect(tryParseToolArgs('true')).toBe(true);
  });

  test('尾随逗号被修复', () => {
    expect(tryParseToolArgs('{"a":1,}')).toEqual({ a: 1 });
    expect(tryParseToolArgs('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
  });

  test('未加引号的字符串值被加引号', () => {
    expect(tryParseToolArgs('{"name":hello}')).toEqual({ name: 'hello' });
  });

  test('截断的 JSON 被补全', () => {
    expect(tryParseToolArgs('{"a":"hel')).toEqual({ a: 'hel' });
  });

  test('数组中混入 KV 被清除', () => {
    expect(tryParseToolArgs('["a", "k": 1, "b"]')).toEqual(['a', 'b']);
  });

  test('完全损坏的输入返回 null', () => {
    expect(tryParseToolArgs('{{{{')).toBeNull();
    expect(tryParseToolArgs('')).toBeNull();
  });

  test('null/undefined/非字符串返回 null', () => {
    expect(tryParseToolArgs(null)).toBeNull();
    expect(tryParseToolArgs(undefined)).toBeNull();
    expect(tryParseToolArgs(123)).toBeNull();
  });
});

// ==================== makeResult ====================

describe('makeResult - 统一结果构造', () => {
  test('基本成功结果', () => {
    expect(makeResult(true, 'ok')).toEqual({ success: true, content: 'ok' });
  });

  test('失败结果', () => {
    expect(makeResult(false, 'fail')).toEqual({ success: false, content: 'fail' });
  });

  test('extra 字段被合并', () => {
    expect(makeResult(true, 'x', { tool_call_id: 't1' })).toEqual({
      success: true, content: 'x', tool_call_id: 't1',
    });
  });

  test('空内容字符串', () => {
    expect(makeResult(true, '')).toEqual({ success: true, content: '' });
  });
});

// ==================== normalizeToolResult ====================

describe('normalizeToolResult - 结果格式归一', () => {
  const tid = 'call_1';

  test('标准对象（含 content）补 tool_call_id', () => {
    const r = normalizeToolResult({ success: true, content: 'x' }, tid);
    expect(r).toEqual({ success: true, content: 'x', tool_call_id: tid });
  });

  test('已有 tool_call_id 时保留', () => {
    const r = normalizeToolResult({ success: true, content: 'x', tool_call_id: 'existing' }, tid);
    expect(r.tool_call_id).toBe('existing');
  });

  test('有 message 时 content 取 message', () => {
    const r = normalizeToolResult({ success: true, message: 'm' }, tid);
    expect(r.content).toBe('m');
  });

  test('失败且有 error 时 content 含错误信息', () => {
    const r = normalizeToolResult({ success: false, error: 'boom' }, tid);
    expect(r.content).toBe('操作失败: boom');
    expect(r.message).toBe('boom');
  });

  test('成功且无 content/message/error 时 content 为 JSON 字符串', () => {
    const r = normalizeToolResult({ success: true, foo: 1 }, tid);
    expect(r.content).toBe('{"foo":1}');
    expect(r.metadata).toEqual({ foo: 1 });
  });

  test('纯字符串转为标准成功对象', () => {
    const r = normalizeToolResult('hello', tid);
    expect(r).toEqual({ success: true, content: 'hello', tool_call_id: tid });
  });

  test('null 转为未知结果格式失败对象', () => {
    const r = normalizeToolResult(null, tid);
    expect(r.success).toBe(false);
    expect(r.content).toBe('');
    expect(r.tool_call_id).toBe(tid);
  });
});
