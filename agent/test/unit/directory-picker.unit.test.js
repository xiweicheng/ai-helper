// agent/test/unit/directory-picker.unit.test.js
// 原生目录选择框：命令构造（跨平台）/ 选中解析 / 取消与无 GUI 降级 / 超时保护
// 运行：node --test agent/test/unit/directory-picker.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPickCommand, pickDirectoryNative } from '../../src/directory-picker.js';

/** 构造一个 fake child_process（spawnImpl 注入用）：按脚本 emit 事件 */
function fakeSpawn({ stdout = '', code = 0, spawnError = null, autoClose = true } = {}) {
  const calls = [];
  const spawnImpl = (command, args) => {
    calls.push({ command, args });
    const child = {
      // 模拟真实 child_process 的事件订阅接口（close/error）
      on: (ev, fn) => { if (ev === 'close') child._onclose = fn; if (ev === 'error') child._onerror = fn; },
      stdout: { on: (ev, fn) => { if (ev === 'data' && stdout) fn(Buffer.from(stdout)); } },
      stderr: { on: () => {} },
      // 模拟真实 child_process：kill() 会触发 close 事件（超时保护依赖此行为）
      kill: () => child.emitClose(),
      emitClose: () => child._onclose?.(spawnError ? null : code),
      _onclose: null,
    };
    if (spawnError) {
      // spawn ENOENT 以异步 error 事件呈现（而非 throw）
      setImmediate(() => child._onerror?.(new Error(spawnError)));
    } else if (autoClose) {
      setImmediate(() => child._onclose?.(code));
    }
    return child;
  };
  return { spawnImpl, calls };
}

describe('buildPickCommand', () => {
  test('darwin → osascript choose folder（标题中的引号/反斜杠被剔除，防注入）', () => {
    const r = buildPickCommand('选择"目录\\test', 'darwin');
    assert.equal(r.command, 'osascript');
    assert.ok(r.args[0] === '-e');
    assert.ok(r.args[1].includes('choose folder with prompt "选择目录test"'));
  });

  test('win32 → powershell EncodedCommand（base64 UTF-16LE，无明文注入面）', () => {
    const r = buildPickCommand('Select folder', 'win32');
    assert.equal(r.command, 'powershell.exe');
    assert.ok(r.args.includes('-EncodedCommand'));
    const encoded = r.args[r.args.indexOf('-EncodedCommand') + 1];
    const script = Buffer.from(encoded, 'base64').toString('utf16le');
    assert.ok(script.includes('FolderBrowserDialog'));
    assert.ok(script.includes('Select folder'));
  });

  test('linux → zenity 优先，携带 kdialog 回退', () => {
    const r = buildPickCommand('选择目录', 'linux');
    assert.equal(r.command, 'zenity');
    assert.ok(r.fallback);
    assert.equal(r.fallback.command, 'kdialog');
  });
});

describe('pickDirectoryNative', () => {
  test('选中：stdout 为 POSIX 路径（带尾斜杠/换行）→ 去尾斜杠返回绝对路径', async () => {
    const { spawnImpl } = fakeSpawn({ stdout: '/Users/xiweicheng/Downloads/\n' });
    const r = await pickDirectoryNative('选择目录', { spawnImpl, platform: 'darwin' });
    assert.equal(r.success, true);
    assert.equal(r.path, '/Users/xiweicheng/Downloads');
    assert.equal(r.available, true);
  });

  test('用户取消：非 0 退出且无输出 → success:true + path:null（静默）', async () => {
    const { spawnImpl } = fakeSpawn({ stdout: '', code: 1 });
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'darwin' });
    assert.equal(r.success, true);
    assert.equal(r.path, null);
    assert.equal(r.available, true);
  });

  test('无 GUI（spawn ENOENT）且无回退 → available:false，扩展端据此置灰按钮', async () => {
    const { spawnImpl } = fakeSpawn({ spawnError: 'spawn osascript ENOENT' });
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'darwin' });
    assert.equal(r.success, false);
    assert.equal(r.available, false);
  });

  test('zenity 不存在 → 回退 kdialog 成功返回路径', async () => {
    const calls = [];
    const spawnImpl = (command, args) => {
      calls.push(command);
      if (command === 'zenity') {
        const child = { on: (ev, fn) => { if (ev === 'error') child._onerror = fn; }, stdout: { on: () => {} }, stderr: { on: () => {} }, kill: () => {}, _onclose: null, _onerror: null };
        setImmediate(() => child._onerror?.(new Error('spawn zenity ENOENT')));
        return child;
      }
      const child = {
        on: (ev, fn) => { if (ev === 'close') child._onclose = fn; },
        stdout: { on: (ev, fn) => { if (ev === 'data') fn(Buffer.from('/home/user/ws')); } },
        stderr: { on: () => {} }, kill: () => {}, _onclose: null, _onerror: null,
      };
      setImmediate(() => child._onclose?.(0));
      return child;
    };
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'linux', hasDisplay: true });
    assert.deepEqual(calls, ['zenity', 'kdialog']);
    assert.equal(r.success, true);
    assert.equal(r.path, '/home/user/ws');
  });

  test('超时保护：子进程悬挂 → 杀进程并返回 timeout 错误', async () => {
    const { spawnImpl } = fakeSpawn({ autoClose: false });
    const r = await pickDirectoryNative('', { spawnImpl, timeoutMs: 20, platform: 'darwin' });
    assert.equal(r.success, false);
    assert.equal(r.error, 'timeout');
    assert.equal(r.available, true);
  });
});
