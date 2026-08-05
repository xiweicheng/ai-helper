// @vitest-environment jsdom
// artifacts-manager.extractArtifactsFromExecutionLog 单元测试
import { describe, test, expect, beforeAll } from 'vitest';

// 补全 chrome mock（import 链较深：chat-manager -> agent-at-selector -> tabs.onActivated 等）
const noop = () => {};
globalThis.chrome = {
  storage: { local: { get: noop, set: noop }, onChanged: { addListener: noop } },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: noop,
    onMessage: { addListener: noop },
    getContexts: noop,
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
  },
  scripting: { executeScript: noop },
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop },
};

let extractArtifactsFromExecutionLog;

beforeAll(async () => {
  const mod = await import('../../src/side_panel/artifacts-manager.js');
  extractArtifactsFromExecutionLog = mod.extractArtifactsFromExecutionLog;
});

function makeLogEntry(overrides = {}) {
  return {
    id: 'log_' + Math.random().toString(36).substring(2, 10),
    iteration: 1,
    timestamp: new Date().toISOString(),
    status: 'success',
    nodeType: 'tool_exec',
    nodeName: '工具执行: agent_file',
    action: {
      name: 'agent_file',
      params: { action: 'write', path: '/workspace/hello.txt', content: 'hello' },
    },
    observation: JSON.stringify({ path: '/workspace/hello.txt', size: 5 }),
    duration: 100,
    ...overrides,
  };
}

describe('extractArtifactsFromExecutionLog', () => {
  test('空日志返回空数组', () => {
    expect(extractArtifactsFromExecutionLog([])).toEqual([]);
    expect(extractArtifactsFromExecutionLog(null)).toEqual([]);
    expect(extractArtifactsFromExecutionLog(undefined)).toEqual([]);
  });

  test('agent_file write 操作能提取为产物', () => {
    const log = [makeLogEntry()];
    const artifacts = extractArtifactsFromExecutionLog(log);
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].path).toBe('/workspace/hello.txt');
    expect(artifacts[0].fileName).toBe('hello.txt');
    expect(artifacts[0].toolName).toBe('agent_file');
    expect(artifacts[0].action).toBe('typeWrite');
    expect(artifacts[0].size).toBe(5);
  });

  test('非 tool_exec 节点被忽略', () => {
    const log = [makeLogEntry({ nodeType: 'reflection' })];
    expect(extractArtifactsFromExecutionLog(log)).toEqual([]);
  });

  test('agent_file delete 操作不算产物', () => {
    const log = [makeLogEntry({ action: { name: 'agent_file', params: { action: 'delete', path: '/a.txt' } } })];
    expect(extractArtifactsFromExecutionLog(log)).toEqual([]);
  });

  test('failed 状态的操作不计入产物', () => {
    const log = [makeLogEntry({ status: 'failed' })];
    expect(extractArtifactsFromExecutionLog(log)).toEqual([]);
  });

  test('同一路径多次写入只保留最后一次', () => {
    const log = [
      makeLogEntry({ timestamp: '2026-01-01T00:00:00Z', observation: JSON.stringify({ path: '/w/a.txt' }) }),
      makeLogEntry({ timestamp: '2026-01-01T00:00:01Z', observation: JSON.stringify({ path: '/w/a.txt', size: 99 }) }),
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].size).toBe(99);
  });

  test('action 缺失的条目被跳过', () => {
    const log = [makeLogEntry({ action: undefined })];
    expect(extractArtifactsFromExecutionLog(log)).toEqual([]);
  });
});
