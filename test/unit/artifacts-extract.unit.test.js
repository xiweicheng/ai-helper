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

  test('agent_file write 后再 delete，产物标记为 deleted', () => {
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: '/w/a.txt', content: 'hi' } },
        observation: JSON.stringify({ path: '/w/a.txt', size: 2 }),
      }),
      makeLogEntry({
        timestamp: '2026-01-01T00:00:01Z',
        action: { name: 'agent_file', params: { action: 'delete', path: '/w/a.txt' } },
      }),
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].path).toBe('/w/a.txt');
    expect(artifacts[0].deleted).toBe(true);
  });

  test('agent_exec rm 命令标记已创建的文件为 deleted', () => {
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: '/w/build.sh', content: 'echo hi > /w/out.txt' } },
        observation: JSON.stringify({ path: '/w/build.sh', size: 20 }),
      }),
      {
        id: 'log_exec',
        iteration: 1,
        timestamp: '2026-01-01T00:00:01Z',
        status: 'success',
        nodeType: 'tool_exec',
        nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'rm /w/out.txt' } },
        observation: null,
        duration: 50,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    // build.sh 应该正常存在，out.txt 不应出现（rm 只标记删除，不创建新产物）
    const buildSh = artifacts.find(a => a.path.endsWith('build.sh'));
    expect(buildSh).toBeTruthy();
    expect(buildSh.deleted).toBeFalsy();
  });

  test('agent_file 写入脚本后执行，脚本内创建的文件被追踪为产物', () => {
    const scriptContent = '#!/bin/bash\necho "hello" > /workspace/output/result.txt\nmkdir -p /workspace/output/data';
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: '/workspace/build.sh', content: scriptContent } },
        observation: JSON.stringify({ path: '/workspace/build.sh', size: scriptContent.length }),
      }),
      {
        id: 'log_exec',
        iteration: 1,
        timestamp: '2026-01-01T00:00:01Z',
        status: 'success',
        nodeType: 'tool_exec',
        nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'bash /workspace/build.sh' } },
        observation: null,
        duration: 200,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    // 应该有 3 个产物：build.sh（写入）、result.txt（脚本派生）、data（脚本派生目录）
    const paths = artifacts.map(a => a.path);
    expect(paths).toContain('/workspace/build.sh');
    expect(paths).toContain('/workspace/output/result.txt');
    expect(paths).toContain('/workspace/output/data');
  });

  test('单独 agent_file delete 不产生新产物', () => {
    const log = [makeLogEntry({ action: { name: 'agent_file', params: { action: 'delete', path: '/a.txt' } } })];
    expect(extractArtifactsFromExecutionLog(log)).toEqual([]);
  });

  // ── 跨平台：Windows CMD 批处理脚本 ──
  test('Windows CMD 脚本执行后，脚本内创建的文件被追踪', () => {
    const batContent = '@echo off\r\necho hello > C:\\output\\result.txt\r\nmkdir C:\\output\\data\r\ncopy src.txt C:\\output\\dest.txt';
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: 'C:/workspace/build.bat', content: batContent } },
        observation: JSON.stringify({ path: 'C:/workspace/build.bat', size: batContent.length }),
      }),
      {
        id: 'log_exec', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'cmd /c C:\\workspace\\build.bat' } },
        observation: null, duration: 200,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    expect(paths).toContain('C:/workspace/build.bat');
    expect(paths.some(p => p.includes('result.txt'))).toBe(true);
    expect(paths.some(p => p.includes('data'))).toBe(true);
  });

  // ── 跨平台：PowerShell 脚本 ──
  test('PowerShell 脚本执行后，脚本内创建的文件被追踪', () => {
    const psContent = 'Set-Content -Path "C:\\output\\log.txt" -Value "done"\nNew-Item -Path "C:\\output\\data" -ItemType Directory';
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: 'C:/workspace/deploy.ps1', content: psContent } },
        observation: JSON.stringify({ path: 'C:/workspace/deploy.ps1', size: psContent.length }),
      }),
      {
        id: 'log_exec', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'powershell -File C:\\workspace\\deploy.ps1' } },
        observation: null, duration: 300,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    expect(paths).toContain('C:/workspace/deploy.ps1');
    expect(paths.some(p => p.includes('log.txt'))).toBe(true);
    expect(paths.some(p => p.includes('data'))).toBe(true);
  });

  // ── 跨平台：Windows CMD 删除命令 ──
  test('Windows del 命令标记文件为 deleted', () => {
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: 'C:/workspace/temp.txt', content: 'temp' } },
        observation: JSON.stringify({ path: 'C:/workspace/temp.txt', size: 4 }),
      }),
      {
        id: 'log_del', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'del C:\\workspace\\temp.txt' } },
        observation: null, duration: 50,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const tempFile = artifacts.find(a => a.path.endsWith('temp.txt'));
    expect(tempFile).toBeTruthy();
    expect(tempFile.deleted).toBe(true);
  });

  // ── 跨平台：PowerShell Remove-Item 删除 ──
  test('PowerShell Remove-Item 标记文件为 deleted', () => {
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: '/workspace/old.txt', content: 'old' } },
        observation: JSON.stringify({ path: '/workspace/old.txt', size: 3 }),
      }),
      {
        id: 'log_rm', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'Remove-Item /workspace/old.txt' } },
        observation: null, duration: 50,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const oldFile = artifacts.find(a => a.path.endsWith('old.txt'));
    expect(oldFile).toBeTruthy();
    expect(oldFile.deleted).toBe(true);
  });

  // ── 跨平台：Python pathlib 支持 ──
  test('Python 脚本中 pathlib.Path 创建的文件被追踪', () => {
    const pyContent = 'from pathlib import Path\nPath("/workspace/output/data.txt").write_text("hello")\nPath("/workspace/output/logs").mkdir()';
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: '/workspace/gen.py', content: pyContent } },
        observation: JSON.stringify({ path: '/workspace/gen.py', size: pyContent.length }),
      }),
      {
        id: 'log_exec', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'python /workspace/gen.py' } },
        observation: null, duration: 150,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    expect(paths).toContain('/workspace/gen.py');
    expect(paths).toContain('/workspace/output/data.txt');
    expect(paths).toContain('/workspace/output/logs');
  });

  // ── 相对路径 + cwd 解析：删除标记能正确匹配 ──
  test('通过 cwd 参数解析相对路径，rm 删除能正确匹配已创建的文件', () => {
    const log = [
      // 创建文件：命令中包含 cd，文件以相对路径创建
      {
        id: 'log_create', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'cd /workspace && echo "hello" > dir_a/shell_created.txt', cwd: '/workspace' } },
        observation: null, duration: 100,
      },
      // 删除文件：rm 使用相对路径，依赖 cwd 解析
      {
        id: 'log_delete', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'rm -f dir_a/shell_created.txt', cwd: '/workspace' } },
        observation: null, duration: 50,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const created = artifacts.find(a => a.path.endsWith('shell_created.txt'));
    expect(created).toBeTruthy();
    expect(created.path).toBe('/workspace/dir_a/shell_created.txt');
    expect(created.deleted).toBe(true);
  });

  // ── 脚本中含变量引用的路径应被过滤 ──
  test('脚本中 $VAR 变量引用的路径不会被识别为产物', () => {
    const scriptContent = '#!/bin/bash\nSCRIPT_DIR="/workspace/output"\necho "data" > $SCRIPT_DIR/script_file_1.txt\necho "ok" > /workspace/output/fixed.txt';
    const log = [
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: '/workspace/build.sh', content: scriptContent } },
        observation: JSON.stringify({ path: '/workspace/build.sh', size: scriptContent.length }),
      }),
      {
        id: 'log_exec', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'bash /workspace/build.sh' } },
        observation: null, duration: 200,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    // 含 $SCRIPT_DIR 的路径不应出现
    expect(paths.some(p => p.includes('$SCRIPT_DIR'))).toBe(false);
    // 但固定路径 /workspace/output/fixed.txt 应该被追踪
    expect(paths).toContain('/workspace/output/fixed.txt');
  });

  // ── agent_file write 绝对路径 + cd+rm 无 cwd 删除：后缀匹配 ──
  test('agent_file write 绝对路径创建的文件，后续被无 cwd 的 cd+rm 删除，能正确标记 deleted', () => {
    const log = [
      // 创建文件：agent_file write 使用绝对路径
      makeLogEntry({
        timestamp: '2026-01-01T00:00:00Z',
        action: { name: 'agent_file', params: { action: 'write', path: '/workspace/file_test/script_files/script_file_1.txt', content: 'hello' } },
        observation: JSON.stringify({ path: '/workspace/file_test/script_files/script_file_1.txt', size: 5 }),
      }),
      // 删除文件：cd 使用相对路径，无 params.cwd
      {
        id: 'log_rm', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'cd file_test/script_files && rm -f script_file_1.txt && echo "rm 删除 script_file_1.txt 成功"' } },
        observation: null, duration: 50,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const target = artifacts.find(a => a.path.endsWith('script_file_1.txt'));
    expect(target).toBeTruthy();
    expect(target.path).toBe('/workspace/file_test/script_files/script_file_1.txt');
    expect(target.deleted).toBe(true);
  });

  // ── 引号内的 > 不应被误识别为重定向 ──
  test('echo 引号内的 > 不会被误识别为重定向，tee 目标文件正确追踪', () => {
    const log = [
      {
        id: 'log_exec', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: {
          name: 'agent_exec',
          params: {
            command: 'echo "这是通过命令行 echo + tee 写入的内容" | tee /workspace/file_test/cmd_files/cmd_file_1.txt',
            cwd: '/workspace',
          },
        },
        observation: null, duration: 100,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    // 引号内的“写入的内容”不应被识别为文件
    expect(paths.some(p => p.includes('写入的内容'))).toBe(false);
    // tee 的目标文件应被正确追踪
    expect(paths).toContain('/workspace/file_test/cmd_files/cmd_file_1.txt');
  });
});
