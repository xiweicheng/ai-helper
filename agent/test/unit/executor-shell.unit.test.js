// agent/test/unit/executor-shell.unit.test.js
// shell 选择纯函数单元测试：Windows（含 Git Bash MSYS SHELL 陷阱）/ macOS / Linux（含无 bash 兜底）
// 运行：node --test agent/test/unit/executor-shell.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pickShell } from '../../src/executor.js';

const noPaths = () => false;
const onlyWinCmd = (p) => p === 'C:\\Windows\\System32\\cmd.exe';

describe('pickShell - Windows', () => {
  test('SHELL 为 Git Bash 的 MSYS 路径（/usr/bin/bash，Windows 上不存在）时不被直接使用', () => {
    const r = pickShell('win32', { SHELL: '/usr/bin/bash', COMSPEC: 'C:\\Windows\\System32\\cmd.exe' }, onlyWinCmd);
    assert.equal(r.shell, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(r.args, ['/c']);
  });

  test('SHELL 为存在的 Git Bash 路径时使用 bash', () => {
    const bash = 'C:\\Program Files\\Git\\bin\\bash.exe';
    const r = pickShell('win32', { SHELL: bash, COMSPEC: 'C:\\Windows\\System32\\cmd.exe' }, (p) => p === bash);
    assert.equal(r.shell, bash);
    assert.deepEqual(r.args, ['-c']);
  });

  test('MSYS SHELL 且 Git Bash 与 COMSPEC 都存在时优先 Git Bash（而非 cmd）', () => {
    const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
    const comspec = 'C:\\Windows\\System32\\cmd.exe';
    const r = pickShell('win32', { SHELL: '/usr/bin/bash', COMSPEC: comspec }, (p) => p === gitBash || p === comspec);
    assert.equal(r.shell, gitBash);
    assert.deepEqual(r.args, ['-c']);
  });

  test('USERPROFILE 下的 Git Bash 安装也被探测到', () => {
    const userBash = 'D:\\Users\\me\\AppData\\Local\\Programs\\Git\\bin\\bash.exe';
    const r = pickShell('win32', { SHELL: '/usr/bin/bash', USERPROFILE: 'D:\\Users\\me' }, (p) => p === userBash);
    assert.equal(r.shell, userBash);
  });

  test('PowerShell SHELL（存在）时使用 -Command', () => {
    const ps = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const r = pickShell('win32', { SHELL: ps }, (p) => p === ps);
    assert.equal(r.shell, ps);
    assert.deepEqual(r.args, ['-Command']);
  });

  test('全部候选不存在时兜底 cmd.exe（PATH 解析）', () => {
    const r = pickShell('win32', { SHELL: '/usr/bin/bash' }, noPaths);
    assert.equal(r.shell, 'cmd.exe');
    assert.deepEqual(r.args, ['/c']);
  });

  test('USERPROFILE 缺失时不产生 undefined 路径拼接，兜底 cmd.exe', () => {
    const r = pickShell('win32', {}, noPaths);
    assert.equal(r.shell, 'cmd.exe');
  });
});

describe('pickShell - macOS', () => {
  test('SHELL=/bin/zsh（存在）时使用', () => {
    const r = pickShell('darwin', { SHELL: '/bin/zsh' }, (p) => p === '/bin/zsh');
    assert.equal(r.shell, '/bin/zsh');
    assert.deepEqual(r.args, ['-c']);
  });

  test('SHELL 指向不存在的路径时回退 /bin/zsh', () => {
    const r = pickShell('darwin', { SHELL: '/nonexistent/bash' }, noPaths);
    assert.equal(r.shell, '/bin/zsh');
  });

  test('fish 等未覆盖 shell 时回退 /bin/zsh（与原实现行为一致）', () => {
    const r = pickShell('darwin', { SHELL: '/opt/homebrew/bin/fish' }, (p) => p === '/opt/homebrew/bin/fish');
    assert.equal(r.shell, '/bin/zsh');
  });
});

describe('pickShell - Linux', () => {
  test('SHELL=/bin/zsh（存在）时使用', () => {
    const r = pickShell('linux', { SHELL: '/bin/zsh' }, (p) => p === '/bin/zsh');
    assert.equal(r.shell, '/bin/zsh');
    assert.deepEqual(r.args, ['-c']);
  });

  test('无 SHELL 时探测到 /bin/bash 使用 bash', () => {
    const r = pickShell('linux', {}, (p) => p === '/bin/bash');
    assert.equal(r.shell, '/bin/bash');
    assert.deepEqual(r.args, ['-c']);
  });

  test('Alpine 场景（仅 /bin/sh 存在）回退 /bin/sh', () => {
    const r = pickShell('linux', { SHELL: '/bin/sh' }, (p) => p === '/bin/sh');
    assert.equal(r.shell, '/bin/sh');
    assert.deepEqual(r.args, ['-c']);
  });

  test('极端场景（探测均不存在）仍返回 /bin/sh 作为最后兜底', () => {
    const r = pickShell('linux', {}, noPaths);
    assert.equal(r.shell, '/bin/sh');
  });

  test('SHELL 指向不存在的路径时跳过，走探测链', () => {
    const r = pickShell('linux', { SHELL: '/opt/removed/zsh' }, (p) => p === '/bin/bash');
    assert.equal(r.shell, '/bin/bash');
  });
});
