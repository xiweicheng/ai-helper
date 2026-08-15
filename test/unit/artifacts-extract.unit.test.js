// @vitest-environment jsdom
// artifacts-manager.extractArtifactsFromExecutionLog 单元测试
import { describe, test, expect, beforeAll, vi } from 'vitest';

// mock 工作目录根路径（checkArtifactsFileExistence 用于过滤目录外产物）
vi.mock('../../src/side_panel/workspace-manager.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getWorkspaceRoot: async () => '/Users/test/.ai-helper-agent/workspace',
  };
});

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
let checkArtifactsFileExistence;
let showArtifactsModal;
let hideArtifactsModal;

beforeAll(async () => {
  const mod = await import('../../src/side_panel/artifacts-manager.js');
  extractArtifactsFromExecutionLog = mod.extractArtifactsFromExecutionLog;
  checkArtifactsFileExistence = mod.checkArtifactsFileExistence;
  showArtifactsModal = mod.showArtifactsModal;
  hideArtifactsModal = mod.hideArtifactsModal;
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

  // ── heredoc 内联脚本：字面量路径静态提取 ──
  test('agent_exec 内联 heredoc Python 脚本中创建的字面量路径被追踪', () => {
    const command = [
      'cd /workspace && python3 - <<\'EOF\'',
      'import os',
      'os.makedirs(\'/workspace/heredoc_dir\', exist_ok=True)',
      'with open(\'/workspace/heredoc_file.txt\', \'w\') as f:',
      '    f.write(\'hi\')',
      'EOF',
    ].join('\n');
    const log = [{
      id: 'log_heredoc', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/workspace' } },
      observation: null, duration: 100,
    }];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    expect(paths).toContain('/workspace/heredoc_dir');
    expect(paths).toContain('/workspace/heredoc_file.txt');
  });

  // ── 观察输出解析：ls -R（覆盖 heredoc 动态随机路径场景）──
  test('ls -R 观察输出中的动态创建文件/目录被追踪为产物', () => {
    const command = 'cd /Users/xiweicheng/.ai-helper-agent/workspace/random_files_20260813_200845 && ls -R';
    const observation = 'components frost_nova.txt karma_nebula.js lib nova_frost.json src utils '
      + './components: delta_gamma harbor_delta harbor_orbit nova_karma.log '
      + './components/delta_gamma: nebula_ivory.log '
      + './components/harbor_delta: karma_beta.csv nebula_harbor.sh quantum_mosaic.py '
      + './lib: frost_nimbus.json harbor_coral.js lunar_quantum '
      + './lib/lunar_quantum: coral_nebula.md harbor_lunar.sh pixel_mosaic.html';
    const log = [{
      id: 'log_lsr', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/Users/xiweicheng/.ai-helper-agent/workspace' } },
      observation, duration: 30,
    }];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const base = '/Users/xiweicheng/.ai-helper-agent/workspace/random_files_20260813_200845';
    const paths = artifacts.map(a => a.path);
    // 目录条目下的文件
    expect(paths).toContain(base + '/components/delta_gamma/nebula_ivory.log');
    expect(paths).toContain(base + '/components/harbor_delta/karma_beta.csv');
    expect(paths).toContain(base + '/lib/lunar_quantum/coral_nebula.md');
    // 根目录条目文件
    expect(paths).toContain(base + '/frost_nova.txt');
    // 目录应标记为 directory
    const components = artifacts.find(a => a.path === base + '/components');
    expect(components).toBeTruthy();
    expect(components.type).toBe('directory');
    const libLunar = artifacts.find(a => a.path === base + '/lib/lunar_quantum');
    expect(libLunar).toBeTruthy();
    expect(libLunar.type).toBe('directory');
  });

  // ── 观察输出解析：find ──
  test('find -type d 观察输出中的路径被追踪且识别为目录', () => {
    const command = 'cd /tmp/demo && find . -type d | sort';
    const observation = './src ./src/utils ./src/utils/helpers';
    const log = [{
      id: 'log_find', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/tmp' } },
      observation, duration: 30,
    }];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const base = '/tmp/demo';
    expect(artifacts.length).toBe(3);
    expect(artifacts.every(a => a.type === 'directory')).toBe(true);
    expect(artifacts.map(a => a.path)).toContain(base + '/src/utils/helpers');
  });

  // ── 纯查看既有目录：ls -la / find / du 不应把已有文件误识别为产物 ──
  test('查看既有目录的 ls -la / find / du 输出不会被识别为产物', () => {
    const base = '/Users/xiweicheng/.ai-helper-agent/workspace/aaa121';
    const lsObs = 'total 952024 drwxr-xr-x@ 37 xiweicheng staff 1184 7 31 22:17 . '
      + '-rw-r--r--@ 1 xiweicheng staff 1311080 7 31 22:17 03 Unit 1 Speaking.mp3 '
      + '-rw-r--r--@ 1 xiweicheng staff 27248 7 27 21:03 2025年提成统计_计算结果.xlsx';
    const duObs = `465M ${base} ---按大小排序--- 465M ${base} 177M ${base}/pdf-1784820229186.pdf 129M ${base}/考点串讲2回放.mp4`;
    const log = [
      {
        id: 'log_ls', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: `ls -la ${base}` } },
        observation: lsObs, duration: 100,
      },
      {
        id: 'log_du', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: `du -sh ${base} && echo "---按大小排序---" && du -ah ${base} | sort -rh | head -10` } },
        observation: duObs, duration: 70,
      },
      {
        id: 'log_find', iteration: 1, timestamp: '2026-01-01T00:00:02Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: `find ${base} -maxdepth 1 -type f` } },
        observation: `${base}/pdf-1784820229186.pdf ${base}/考点串讲2回放.mp4`, duration: 40,
      },
    ];
    expect(extractArtifactsFromExecutionLog(log)).toEqual([]);
  });

  // ── 观察输出解析：ls -la 不误报 ──
  test('ls -la 观察输出（无 ./ 前缀）不会被误识别为产物', () => {
    const command = 'ls -la /workspace';
    const observation = 'total 91488 drwxr-xr-x@ 3 xiweicheng staff 96 7 31 22:38 __pycache__ -rw-r--r--@ 1 xiweicheng staff 4351 8 6 06:49 _routes_grep.txt';
    const log = [{
      id: 'log_lsla', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/workspace' } },
      observation, duration: 30,
    }];
    expect(extractArtifactsFromExecutionLog(log)).toEqual([]);
  });

  // ── 观察输出解析：grep path:line 不误报 ──
  test('grep path:line 格式观察输出不会被误识别为产物', () => {
    const command = 'grep -r TODO .';
    const observation = './src/index.js:12: TODO fix this';
    const log = [{
      id: 'log_grep', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/workspace' } },
      observation, duration: 30,
    }];
    expect(extractArtifactsFromExecutionLog(log)).toEqual([]);
  });

  // ── 完整场景：cat heredoc 写脚本 + bash 执行 + find 观察输出（无 ./ 前缀）──
  test('cat heredoc 写入脚本后 bash 执行，find 观察输出中的动态文件被追踪', () => {
    const command = [
      'cd /workspace && cat > /tmp/gen.sh << \'EOF\'',
      '#!/bin/bash',
      'ROOT="random-structure-$(date +%Y%m%d-%H%M%S)"',
      'mkdir -p "$ROOT"',
      ': > "$ROOT/alpha-beta-100.txt"',
      'echo hi >> "$ROOT/alpha-beta-100.txt"',
      'echo "=== 目录树 ==="',
      'find "$ROOT" -type d | sort',
      'echo "=== 文件列表 ==="',
      'find "$ROOT" -type f | sort',
      'EOF',
      'bash /tmp/gen.sh',
    ].join('\n');
    // 脚本内 find "$ROOT" 输出：无 ./ 前缀的相对路径
    const observation = '=== 目录树 === random-structure-20260813-203051 '
      + 'random-structure-20260813-203051/delta-mike-273 '
      + '=== 文件列表 === '
      + 'random-structure-20260813-203051/delta-mike-273/tango-kilo-683.json '
      + 'random-structure-20260813-203051/foxtrot-whiskey-952.json '
      + '文件总数: 2 目录总数: 1 根目录: random-structure-20260813-203051';
    const log = [{
      id: 'log_gen', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/workspace' } },
      observation, duration: 300,
    }];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    const base = '/workspace/random-structure-20260813-203051';
    // cat 写入的脚本本身
    expect(paths).toContain('/tmp/gen.sh');
    // 动态创建的文件（无 ./ 前缀 find 输出）
    expect(paths).toContain(base + '/delta-mike-273/tango-kilo-683.json');
    expect(paths).toContain(base + '/foxtrot-whiskey-952.json');
    // 动态创建的目录应标记为 directory
    const dir = artifacts.find(a => a.path === base + '/delta-mike-273');
    expect(dir).toBeTruthy();
    expect(dir.type).toBe('directory');
  });

  // ── heredoc 内容含分号/&& 时命令分割不被破坏 ──
  test('heredoc Python 脚本内容含分号时仍能追踪字面量路径', () => {
    const command = [
      'python3 - <<\'EOF\'',
      'import os; os.makedirs(\'/tmp/a/b\', exist_ok=True)',
      'open(\'/tmp/a/b/c.txt\', \'w\').write(\'hi\')',
      'EOF',
    ].join('\n');
    const log = [{
      id: 'log_hdoc', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/workspace' } },
      observation: null, duration: 100,
    }];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    expect(paths).toContain('/tmp/a/b');
    expect(paths).toContain('/tmp/a/b/c.txt');
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

  // ── 观察输出解析：脚本内同时 find -type d 与 find -type f（分类修复）──
  test('脚本同时输出 find -type d 与 find -type f 时，文件不会被误标为目录', () => {
    const command = [
      'cd /workspace && cat > /tmp/gen2.sh << \'EOF\'',
      '#!/bin/bash',
      'ROOT="random-structure-$(date +%Y%m%d-%H%M%S)"',
      'mkdir -p "$ROOT"',
      'echo "=== 目录树 ==="',
      'find "$ROOT" -type d | sort',
      'echo "=== 文件列表 ==="',
      'find "$ROOT" -type f | sort',
      'EOF',
      'bash /tmp/gen2.sh',
    ].join('\n');
    // find -type d 输出在前，find -type f 输出在后（用户日志的真实结构）
    const observation = '=== 目录树 === random-structure-20260813-203051 '
      + 'random-structure-20260813-203051/delta-mike-273 '
      + 'random-structure-20260813-203051/delta-mike-273/golf-xray-449 '
      + '=== 文件列表 === '
      + 'random-structure-20260813-203051/delta-mike-273/golf-xray-449/charlie-kilo-178/kilo-alpha-207.json '
      + 'random-structure-20260813-203051/foxtrot-whiskey-952.json '
      + 'random-structure-20260813-203051/yankee-oscar-1008.txt '
      + '文件总数: 3 目录总数: 2 根目录: random-structure-20260813-203051';
    const log = [{
      id: 'log_gen2', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/workspace' } },
      observation, duration: 300,
    }];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const base = '/workspace/random-structure-20260813-203051';
    // 目录识别为 directory
    const dir = artifacts.find(a => a.path === base + '/delta-mike-273/golf-xray-449');
    expect(dir).toBeTruthy();
    expect(dir.type).toBe('directory');
    // 带扩展名的文件绝不能被标为 directory（findType 首匹配 d 的旧 bug）
    for (const p of [
      base + '/delta-mike-273/golf-xray-449/charlie-kilo-178/kilo-alpha-207.json',
      base + '/foxtrot-whiskey-952.json',
      base + '/yankee-oscar-1008.txt',
    ]) {
      const f = artifacts.find(a => a.path === p);
      expect(f).toBeTruthy();
      expect(f.type).toBe('file');
    }
  });

  // ── 观察输出解析：截断 token（.../g...）过滤 ──
  test('观察输出末尾截断垃圾 token（.../g...）不会被识别为产物', () => {
    const command = 'cd /tmp/demo && find . -type f | sort';
    // 500 字符截断后追加 '...'，最后一个 token 是残缺路径
    const observation = './a.txt ./b/c.json ./b/c/d.log .../g...';
    const log = [{
      id: 'log_trunc', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/tmp' } },
      observation, duration: 30,
    }];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    expect(paths).toContain('/tmp/demo/a.txt');
    expect(paths).toContain('/tmp/demo/b/c.json');
    // 残缺 token 不产生任何产物（无包含 '...' 的路径）
    expect(paths.some(p => p.includes('...'))).toBe(false);
  });

  // ── rm -rf 目录递归删除：目录内文件一并标记为 deleted ──
  test('rm -rf 删除目录后，目录内已创建的文件被递归标记为 deleted', () => {
    const log = [
      // 先创建目录树与文件（脚本生成）
      {
        id: 'log_create', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'cd /workspace && bash /tmp/gen.sh', cwd: '/workspace' } },
        observation: '=== 目录树 === random-structure-20260813-203044 '
          + 'random-structure-20260813-203044/tango-kilo-683.json '
          + 'random-structure-20260813-203044/yankee-oscar-1008.txt '
          + '文件总数: 2 目录总数: 1 根目录: random-structure-20260813-203044',
        duration: 200,
      },
      // 再递归删除整个目录
      {
        id: 'log_rm', iteration: 1, timestamp: '2026-01-01T00:00:01Z', status: 'success',
        nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
        action: { name: 'agent_exec', params: { command: 'cd /workspace && rm -rf random-structure-20260813-203044', cwd: '/workspace' } },
        observation: null, duration: 50,
      },
    ];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const base = '/workspace/random-structure-20260813-203044';
    expect(artifacts.length).toBe(2);
    for (const a of artifacts) {
      expect(a.path.startsWith(base + '/')).toBe(true);
      expect(a.deleted).toBe(true);
    }
  });

  // ── heredoc 定界符贪婪匹配：<<'EOF' 能正确保护整个内容块 ──
  test('heredoc 内容含多条语句与分号时命令链分割完整，全部字面量路径被追踪', () => {
    const command = [
      'cd /workspace && python3 - <<\'EOF\'',
      'import os',
      'for d in [\'dir_a\', \'dir_b\']: os.makedirs(\'/workspace/heredoc_multi/\' + d, exist_ok=True)',
      'open(\'/workspace/heredoc_multi/dir_a/f1.txt\', \'w\').write(\'a\')',
      'open(\'/workspace/heredoc_multi/dir_b/f2.txt\', \'w\').write(\'b\')',
      'EOF',
    ].join('\n');
    const log = [{
      id: 'log_hdoc2', iteration: 1, timestamp: '2026-01-01T00:00:00Z', status: 'success',
      nodeType: 'tool_exec', nodeName: '工具执行: agent_exec',
      action: { name: 'agent_exec', params: { command, cwd: '/workspace' } },
      observation: null, duration: 100,
    }];
    const artifacts = extractArtifactsFromExecutionLog(log);
    const paths = artifacts.map(a => a.path);
    // 分号拆链的旧 bug 会导致 heredoc 内文件丢失，此处应全部追踪到
    expect(paths).toContain('/workspace/heredoc_multi/dir_a/f1.txt');
    expect(paths).toContain('/workspace/heredoc_multi/dir_b/f2.txt');
  });
});

describe('checkArtifactsFileExistence', () => {
  const WORKSPACE = '/Users/test/.ai-helper-agent/workspace';

  function makeArtifact(path, overrides = {}) {
    return {
      path,
      fileName: path.split('/').pop(),
      toolName: 'agent_exec',
      action: 'typeCreate',
      size: 0,
      timestamp: Date.now(),
      status: 'success',
      type: 'file',
      ...overrides,
    };
  }

  test('工作目录外的产物不发起存在性检查，不被标记 deleted', async () => {
    let capturedMsg = null;
    globalThis.chrome.runtime.sendMessage = (msg) => {
      capturedMsg = msg;
      return Promise.resolve({ success: true, results: {} });
    };
    const outside = makeArtifact('/tmp/outside_task/report.txt');
    const artifacts = [outside];
    const changed = await checkArtifactsFileExistence(artifacts);
    // 目录外产物被过滤后无路径可查，不应发起 CHECK_FILES_EXIST 请求
    expect(changed).toBe(false);
    expect(capturedMsg).toBeNull();
    expect(outside.deleted).toBeFalsy();
  });

  test('工作目录内的产物正常检查，不存在的被标记 deleted', async () => {
    const inside = makeArtifact(`${WORKSPACE}/task_a/keep.txt`);
    const insideDeleted = makeArtifact(`${WORKSPACE}/task_a/gone.txt`);
    const outside = makeArtifact('/etc/hosts');
    globalThis.chrome.runtime.sendMessage = (msg) => {
      // 只应包含工作目录内的两个路径
      expect(msg.type).toBe('CHECK_FILES_EXIST');
      expect(msg.paths.some(p => p.includes('keep.txt'))).toBe(true);
      expect(msg.paths.some(p => p.includes('gone.txt'))).toBe(true);
      expect(msg.paths.some(p => p.includes('hosts'))).toBe(false);
      const results = {};
      for (const p of msg.paths) {
        results[p] = !p.includes('gone.txt');
      }
      return Promise.resolve({ success: true, results });
    };
    const artifacts = [inside, insideDeleted, outside];
    const changed = await checkArtifactsFileExistence(artifacts);
    expect(changed).toBe(true);
    expect(inside.deleted).toBeFalsy();
    expect(insideDeleted.deleted).toBe(true);
    // 目录外产物保持原状态
    expect(outside.deleted).toBeFalsy();
  });

  test('相对路径产物视为工作目录内，正常发起检查', async () => {
    let capturedMsg = null;
    globalThis.chrome.runtime.sendMessage = (msg) => {
      capturedMsg = msg;
      return Promise.resolve({ success: true, results: {} });
    };
    const rel = makeArtifact('task_b/rel_file.txt');
    const changed = await checkArtifactsFileExistence([rel]);
    expect(changed).toBe(false);
    expect(capturedMsg).toBeTruthy();
    expect(capturedMsg.paths.length).toBe(1);
  });
});

describe('showArtifactsModal 目录外产物交互', () => {
  const WORKSPACE = '/Users/test/.ai-helper-agent/workspace';

  function makeArtifact(path, overrides = {}) {
    return {
      path,
      fileName: path.split('/').pop(),
      toolName: 'agent_exec',
      action: 'typeCreate',
      size: 0,
      timestamp: Date.now(),
      status: 'success',
      type: 'file',
      ...overrides,
    };
  }

  test('目录外产物操作按钮禁用、展示"目录外"图标及悬停说明，目录内产物不受影响', async () => {
    globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ success: true, results: {} });
    const outside = makeArtifact('/tmp/outside_task/report.txt');
    const inside = makeArtifact(`${WORKSPACE}/task_a/inside.txt`);
    showArtifactsModal([outside, inside]);
    // 等待异步标记完成（getWorkspaceRoot 为异步）
    await new Promise(r => setTimeout(r, 50));

    const rows = [...document.querySelectorAll('.artifacts-row')];
    expect(rows.length).toBe(2);

    const outsideRow = rows.find(r => r.dataset.path === '/tmp/outside_task/report.txt');
    const outsideIcon = outsideRow.querySelector('.artifact-outside-icon');
    expect(outsideIcon).toBeTruthy();
    // 悬停提示应说明"位于工作目录之外"
    expect(outsideIcon.title).toContain('工作目录之外');
    expect(outsideRow.querySelector('.download-btn').disabled).toBe(true);
    expect(outsideRow.querySelector('.locate-btn').disabled).toBe(true);
    // 目录外的预览按钮与下载/定位保持一致：展示但禁用
    expect(outsideRow.querySelector('.preview-btn').disabled).toBe(true);

    const insideRow = rows.find(r => r.dataset.path === `${WORKSPACE}/task_a/inside.txt`);
    expect(insideRow.querySelector('.artifact-outside-icon')).toBeNull();
    expect(insideRow.querySelector('.download-btn').disabled).toBe(false);
    expect(insideRow.querySelector('.locate-btn').disabled).toBe(false);

    hideArtifactsModal();
    expect(document.getElementById('artifactsModalOverlay')).toBeNull();
  });

  test('双击目录外产物文件名弹提示而不预览', async () => {
    globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ success: true, results: {} });
    // toast 容器：utils.showToast 需要，缺失时静默跳过，这里补上以验证提示被触发
    const toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    document.body.appendChild(toastContainer);

    const outside = makeArtifact('/tmp/outside_task/report.txt');
    showArtifactsModal([outside]);
    await new Promise(r => setTimeout(r, 50));

    const nameEl = document.querySelector('.artifacts-row .artifact-name');
    nameEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    // toast 文案应为目录外提示
    expect(toastContainer.textContent).toContain('不在工作目录下');

    hideArtifactsModal();
    toastContainer.remove();
  });
});
