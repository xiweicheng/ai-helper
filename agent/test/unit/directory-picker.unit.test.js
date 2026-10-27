// agent/test/unit/directory-picker.unit.test.js
// 原生目录选择框：执行计划（跨平台/多后端）/ 选中解析 / 取消与失败区分 / 兜底与超时保护
// 运行：node --test agent/test/unit/directory-picker.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import {
  buildPickPlan, pickDirectoryNative, normalizePickedPath, resolveTmpDir, readEnvVar,
  SHOWN_MARKER_FOR_TEST,
} from '../../src/directory-picker.js';

/** 构造一个 fake child（模拟真实 child_process 的 on / stdout / stderr / kill） */
function makeChild(step = {}) {
  const child = {
    on: (ev, fn) => {
      if (ev === 'close') child._onclose = fn;
      if (ev === 'error') child._onerror = fn;
    },
    stdout: { on: (ev, fn) => { if (ev === 'data' && step.stdout) fn(Buffer.from(step.stdout)); } },
    stderr: { on: (ev, fn) => { if (ev === 'data' && step.stderr) fn(Buffer.from(step.stderr)); } },
    // 真实 child_process：kill() 最终会触发 close（超时保护依赖此行为）
    kill: () => child.emitClose(null),
    emitClose: (code) => child._onclose?.(code),
    _onclose: null,
    _onerror: null,
  };
  if (step.spawnError) {
    // spawn ENOENT 以异步 error 事件呈现（而非 throw）
    setImmediate(() => child._onerror?.(new Error(step.spawnError)));
  } else if (!step.hang) {
    setImmediate(() => child._onclose?.(step.code ?? 0));
  }
  return child;
}

/** 按顺序消费步骤：每调用一次 spawn 取一个 step（用尽后默认 code 0） */
function scriptedSpawn(steps) {
  const queue = [...steps];
  const calls = [];
  const spawnImpl = (command, args) => {
    calls.push({ command, args });
    return makeChild(queue.shift() || {});
  };
  return { spawnImpl, calls };
}

describe('buildPickPlan', () => {
  test('darwin → 单个 osascript choose folder（标题中的引号/反斜杠被剔除，防注入）', () => {
    const plan = buildPickPlan('选择"目录\\test', 'darwin');
    assert.equal(plan.length, 1);
    assert.equal(plan[0].command, 'osascript');
    // 引号与反斜杠被替换为空格后再压缩空白：脚本内不再残留可破坏 AppleScript 字符串的字符
    assert.equal(plan[0].args[1], 'POSIX path of (choose folder with prompt "选择 目录 test")');
  });

  test('win32 → 三个后端按序兜底（inline → encoded → cscript）', () => {
    const plan = buildPickPlan('选择目录', 'win32', { env: {} });
    assert.deepEqual(plan.map((p) => p.backend), ['powershell-inline', 'powershell-encoded', 'cscript-vbs']);
  });

  test('win32 → 用 %SystemRoot% 拼绝对路径调用，摆脱 Git Bash 的 PATH 改写', () => {
    const plan = buildPickPlan('', 'win32', { env: { SystemRoot: 'C:\\Windows' } });
    assert.equal(plan[0].command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.equal(plan[2].command, 'C:\\Windows\\System32\\cscript.exe');
  });

  test('win32 inline 后端：脚本不含双引号（避免 Node 参数转义与 PowerShell 解析冲突）', () => {
    const plan = buildPickPlan('选择目录', 'win32', { env: {} });
    const script = plan[0].args[plan[0].args.indexOf('-Command') + 1];
    assert.ok(!script.includes('"'), '内联脚本必须无裸双引号');
    assert.ok(script.includes('FolderBrowserDialog'));
    const titleB64 = plan[0].args[plan[0].args.indexOf('-Command') + 1].match(/FromBase64String\('([^']+)'\)/)[1];
    assert.equal(Buffer.from(titleB64, 'base64').toString('utf8'), '选择目录');
    // 取消/异常必须可区分：否则 PowerShell 报错会被误当作“用户取消”静默吞掉
    assert.ok(script.includes('exit 2'), '取消需 exit 2');
    assert.ok(script.includes('catch'), '异常需 try/catch 包裹');
    assert.ok(script.includes('exit 1'), '异常需 exit 1');
    // 选中路径以 base64 输出，避开中文 Windows 控制台 GBK 编码乱码
    assert.ok(script.includes('ToBase64String'));
  });

  test('win32 encoded 后端：EncodedCommand 解码回可读脚本', () => {
    const plan = buildPickPlan('Select folder', 'win32', { env: {} });
    const encoded = plan[1].args[plan[1].args.indexOf('-EncodedCommand') + 1];
    const script = Buffer.from(encoded, 'base64').toString('utf16le');
    assert.ok(script.includes('FolderBrowserDialog'));
  });

  test('win32 cscript 后端：VBS 脚本为纯 ASCII（不受 .vbs 文件编码解析影响）', () => {
    const plan = buildPickPlan('选择目录', 'win32', { env: {} });
    const vbsItem = plan.find((p) => p.backend === 'cscript-vbs');
    const prepared = vbsItem.prepare();
    try {
      assert.ok(prepared, '临时文件应可写');
      const content = fs.readFileSync(prepared.meta.scriptFile, 'utf8');
      assert.ok(Buffer.from(content, 'utf8').every((b) => b < 0x80), 'VBS 必须纯 ASCII');
      assert.ok(content.includes('BrowseForFolder'));
      assert.ok(content.includes('WScript.Quit 1'), '失败需可区分退出码');
    } finally {
      prepared.cleanup();
    }
  });

  test('win32 cscript 后端：能从临时文件读回选中路径（UTF-16LE + BOM）', () => {
    const plan = buildPickPlan('', 'win32', { env: {} });
    const vbsItem = plan.find((p) => p.backend === 'cscript-vbs');
    const prepared = vbsItem.prepare();
    try {
      fs.writeFileSync(prepared.meta.outputFile, '\ufeffC:\\Users\\xiweicheng\\Workspace', 'utf16le');
      assert.equal(prepared.decode(), 'C:\\Users\\xiweicheng\\Workspace');
    } finally {
      prepared.cleanup();
    }
  });

  test('linux → zenity 优先，kdialog 回退', () => {
    const plan = buildPickPlan('选择目录', 'linux');
    assert.deepEqual(plan.map((p) => p.backend), ['zenity', 'kdialog']);
  });
});

describe('resolveTmpDir', () => {
  test('win32 → 优先 %LOCALAPPDATA%\\Temp（避开 MSYS 改写的 TEMP）', () => {
    assert.equal(
      resolveTmpDir('win32', { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }),
      'C:\\Users\\x\\AppData\\Local\\Temp',
    );
  });

  test('win32 → 拒绝 POSIX 风格的 /tmp，回退 os.tmpdir()', () => {
    assert.equal(resolveTmpDir('win32', { TEMP: '/tmp' }), os.tmpdir());
  });
});

describe('normalizePickedPath', () => {
  test('去尾部斜杠，保留根目录与盘符', () => {
    assert.equal(normalizePickedPath('/Users/x/ws/\n'), '/Users/x/ws');
    assert.equal(normalizePickedPath('/'), '/');
    assert.equal(normalizePickedPath('C:\\'), 'C:\\');
    assert.equal(normalizePickedPath('C:\\Users\\x\\'), 'C:\\Users\\x');
  });
});

describe('pickDirectoryNative', () => {
  test('选中：stdout 为 POSIX 路径（带尾斜杠/换行）→ 去尾斜杠返回绝对路径', async () => {
    const { spawnImpl } = scriptedSpawn([{ stdout: '/Users/xiweicheng/Downloads/\n' }]);
    const r = await pickDirectoryNative('选择目录', { spawnImpl, platform: 'darwin' });
    assert.equal(r.success, true);
    assert.equal(r.path, '/Users/xiweicheng/Downloads');
    assert.equal(r.available, true);
    assert.equal(r.backend, 'osascript');
  });

  test('用户取消：macOS osascript stderr 含 User canceled → 视为取消而非报错', async () => {
    const { spawnImpl } = scriptedSpawn([{ code: 1, stderr: 'execution error: User canceled. (-128)' }]);
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'darwin' });
    assert.equal(r.success, true);
    assert.equal(r.path, null);
    assert.equal(r.available, true);
  });

  test('Windows 取消：exit 2 → 视为取消（不报错）', async () => {
    const { spawnImpl } = scriptedSpawn([{ code: 2 }]);
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'win32', env: {} });
    assert.equal(r.success, true);
    assert.equal(r.path, null);
  });

  test('Windows 选中：stdout 为 UTF-8 base64 路径 → 正确解码（中文路径不乱码）', async () => {
    const picked = 'C:\\Users\\xiweicheng\\项目 目录';
    const { spawnImpl } = scriptedSpawn([{ stdout: Buffer.from(picked, 'utf8').toString('base64') }]);
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'win32', env: {} });
    assert.equal(r.success, true);
    assert.equal(r.path, picked);
    assert.equal(r.backend, 'powershell-inline');
  });

  test('Windows exit 1 且无 stderr → 必须报失败，不能被当作“用户取消”静默吞掉', async () => {
    const { spawnImpl } = scriptedSpawn([{ code: 1 }, { code: 1 }, { code: 1 }]);
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'win32', env: {} });
    assert.equal(r.success, false);
    assert.equal(r.available, false);
    assert.ok(r.error.startsWith('all-backends-failed'));
    assert.ok(r.error.includes('无 stderr'), '应提示可能被安全策略拦截');
    assert.equal(r.attempts.length, 3);
  });

  test('Windows 异常（Add-Type 失败 + stderr）→ 透传原因，并回退到下一个后端', async () => {
    const picked = 'C:\\Users\\x\\ws';
    const { spawnImpl, calls } = scriptedSpawn([
      { code: 1, stderr: 'TypeNotFound: Could not load System.Windows.Forms' },
      { stdout: Buffer.from(picked, 'utf8').toString('base64') },
    ]);
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'win32', env: {} });
    assert.equal(r.success, true);
    assert.equal(r.path, picked);
    assert.equal(r.backend, 'powershell-encoded');
    assert.equal(r.attempts.length, 1);
    assert.ok(r.attempts[0].error.includes('System.Windows.Forms'));
    assert.equal(calls.length, 2, '失败一次后应继续尝试下一个后端');
  });

  test('所有后端 spawn 失败（命令都不存在）→ available:false + no-dialog-tool', async () => {
    const { spawnImpl } = scriptedSpawn([
      { spawnError: 'spawn powershell.exe ENOENT' },
      { spawnError: 'spawn powershell.exe ENOENT' },
      { spawnError: 'spawn cscript.exe ENOENT' },
    ]);
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'win32', env: {} });
    assert.equal(r.success, false);
    assert.equal(r.available, false);
    assert.ok(r.error.startsWith('no-dialog-tool'));
  });

  test('zenity 不存在 → 回退 kdialog 成功返回路径', async () => {
    const { spawnImpl, calls } = scriptedSpawn([
      { spawnError: 'spawn zenity ENOENT' },
      { stdout: '/home/user/ws' },
    ]);
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'linux', hasDisplay: true });
    assert.deepEqual(calls.map((c) => c.command), ['zenity', 'kdialog']);
    assert.equal(r.success, true);
    assert.equal(r.path, '/home/user/ws');
  });

  test('无图形会话（Linux 无 DISPLAY）→ available:false，不拉起子进程', async () => {
    const { spawnImpl, calls } = scriptedSpawn([{ stdout: '/x' }]);
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'linux', hasDisplay: false });
    assert.equal(r.success, false);
    assert.equal(r.available, false);
    assert.equal(r.error, 'no-display');
    assert.equal(calls.length, 0);
  });

  test('超时保护：子进程悬挂 → 杀进程并返回 timeout（不继续拉第二个窗口）', async () => {
    const { spawnImpl, calls } = scriptedSpawn([{ hang: true }, { stdout: '/x' }]);
    const r = await pickDirectoryNative('', { spawnImpl, timeoutMs: 20, platform: 'darwin' });
    assert.equal(r.success, false);
    assert.equal(r.error, 'timeout');
    assert.equal(r.available, true);
    assert.equal(calls.length, 1, '超时后不应再尝试其它后端');
  });

  test('子进程被杀后不触发 close 也会兜底返回（请求不会永久悬挂）', async () => {
    const spawnImpl = () => ({
      on: () => {}, // 永不回调 close
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      kill: () => {},
    });
    const r = await pickDirectoryNative('', { spawnImpl, timeoutMs: 10, platform: 'darwin' });
    assert.equal(r.error, 'timeout');
  });

  test('并发保护：上一个窗口还在等待时直接返回 busy', async () => {
    const { spawnImpl } = scriptedSpawn([{ hang: true }]);
    const first = pickDirectoryNative('', { spawnImpl, platform: 'darwin', timeoutMs: 30 });
    const second = await pickDirectoryNative('', { spawnImpl, platform: 'darwin', timeoutMs: 30 });
    assert.equal(second.error, 'busy');
    await first;
  });

  test('spawnImpl 同步抛异常也不会冒泡（服务不崩）', async () => {
    const spawnImpl = () => { throw new Error('EACCES: spawn blocked by policy'); };
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'darwin' });
    assert.equal(r.success, false);
    assert.equal(r.available, false);
    assert.ok(r.error.includes('EACCES'));
  });

  // 回归钉：EventEmitter 的 'error' 事件若无监听者会直接抛成 uncaughtException。
  // 子进程被强杀时管道可能先行报 EPIPE/ECONNRESET，监听缺失会拖崩整个 agent 进程。
  test('子进程管道 error（EPIPE）被监听，不会抛成未捕获异常', async () => {
    const spawnImpl = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      setImmediate(() => {
        child.stdout.emit('error', new Error('EPIPE'));
        child.stderr.emit('error', new Error('ECONNRESET'));
        child.emit('close', 0);
      });
      return child;
    };
    const r = await pickDirectoryNative('', { spawnImpl, platform: 'darwin' });
    assert.equal(r.success, true);
    assert.equal(r.path, null);
  });
});

// 实测背景：同一个 Windows 电脑上，从 CMD 启动 agent 能弹窗，从 PowerShell / Git Bash 启动弹不出来。
// 这说明 powershell.exe + WinForms 通道本身可用，问题在父进程终端差异；
// 且旧的「首个后端超时就 break」会让第三后端（cscript+VBS）永远没机会。
describe('窗口可见性探测与终端环境差异', () => {
  test('win32：窗口始终没出现 → 按 shownTimeout 快速换下一个后端（不再干等 120s 后 break）', async () => {
    const { spawnImpl, calls } = scriptedSpawn([
      { hang: true }, // 后端 1：进程活着但没有任何输出
      { code: 2 }, // 后端 2：用户取消
    ]);
    const r = await pickDirectoryNative('', {
      spawnImpl, platform: 'win32', env: {}, shownTimeoutMs: 20, timeoutMs: 5000,
    });
    assert.equal(r.success, true);
    assert.equal(r.path, null);
    assert.equal(calls.length, 2, '窗口没出现时必须继续尝试下一个后端');
    assert.equal(r.attempts[0].error, 'no-window-in-20ms');
  });

  test('win32：窗口已出现（收到标记）但用户没选 → 判 timeout 且不再拉第二个窗口', async () => {
    const { spawnImpl, calls } = scriptedSpawn([
      { hang: true, stdout: `${SHOWN_MARKER_FOR_TEST}C:\\tmp\\ws` },
      { code: 2 },
    ]);
    const r = await pickDirectoryNative('', {
      spawnImpl, platform: 'win32', env: {}, shownTimeoutMs: 20, timeoutMs: 60,
    });
    assert.equal(r.success, false);
    assert.equal(r.error, 'timeout');
    assert.equal(calls.length, 1, '窗口已经弹出来了，不应再拉第二个');
  });

  test('win32：三个后端的脚本都要在弹窗前输出窗口标记', () => {
    const plan = buildPickPlan('', 'win32', { env: {} });
    const inline = plan[0].args[plan[0].args.indexOf('-Command') + 1];
    assert.ok(inline.includes(SHOWN_MARKER_FOR_TEST), '内联脚本需输出窗口标记');
    const encoded = Buffer.from(
      plan[1].args[plan[1].args.indexOf('-EncodedCommand') + 1], 'base64',
    ).toString('utf16le');
    assert.ok(encoded.includes(SHOWN_MARKER_FOR_TEST), 'EncodedCommand 脚本需输出窗口标记');
    const prepared = plan[2].prepare();
    try {
      const vbs = fs.readFileSync(prepared.meta.scriptFile, 'utf8');
      assert.ok(vbs.includes(SHOWN_MARKER_FOR_TEST), 'VBS 脚本需输出窗口标记');
    } finally {
      prepared.cleanup();
    }
  });

  test('win32：owner 窗口拿不到句柄时降级为无 owner 调用，不整体失败', () => {
    const plan = buildPickPlan('', 'win32', { env: {} });
    const script = plan[0].args[plan[0].args.indexOf('-Command') + 1];
    // Form 创建包在独立 try 里，失败置 $owner = $null
    assert.ok(/try \{ \$owner = New-Object System\.Windows\.Forms\.Form/.test(script));
    assert.ok(script.includes('$owner = $null'), '失败时必须降级为 $null');
    // ShowDialog 分两条路径：有 owner 用 owner，否则无 owner
    assert.ok(script.includes('$f.ShowDialog($owner)') && script.includes('$f.ShowDialog()'));
  });

  test('环境变量名大小写不敏感：SYSTEMROOT 全大写也能拼出绝对路径', () => {
    assert.equal(readEnvVar({ SYSTEMROOT: 'C:\\Windows' }, 'SystemRoot'), 'C:\\Windows');
    assert.equal(readEnvVar({ systemroot: 'D:\\Windows' }, 'SystemRoot'), 'D:\\Windows');
    assert.equal(readEnvVar({}, 'SystemRoot'), '');
    const plan = buildPickPlan('', 'win32', { env: { SYSTEMROOT: 'C:\\Windows' } });
    assert.equal(plan[0].command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.equal(plan[2].command, 'C:\\Windows\\System32\\cscript.exe');
  });

  test('失败时回传环境快照（用于区分 CMD / PowerShell / Git Bash 启动）', async () => {
    const { spawnImpl } = scriptedSpawn([{ code: 1 }, { code: 1 }, { code: 1 }]);
    const r = await pickDirectoryNative('', {
      spawnImpl,
      platform: 'win32',
      env: { SYSTEMROOT: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local', PATH: '/usr/bin:/bin' },
    });
    assert.ok(r.environment, '失败结果需带 environment 快照');
    assert.equal(r.environment.systemRoot, 'C:\\Windows');
    assert.equal(r.environment.pathStartsWithPosix, true, 'Git Bash 的 PATH 以 / 开头');
    assert.equal(r.environment.commands.length, 3);
  });

  test('总预算耗尽后不再拉起新后端', async () => {
    const { spawnImpl, calls } = scriptedSpawn([{ code: 2 }]);
    const r = await pickDirectoryNative('', {
      spawnImpl, platform: 'win32', env: {}, totalBudgetMs: 0,
    });
    assert.equal(calls.length, 0);
    assert.equal(r.success, false);
    assert.ok(r.error.startsWith('all-backends-failed'));
  });
});
