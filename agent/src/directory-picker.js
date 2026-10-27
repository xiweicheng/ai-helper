// agent/src/directory-picker.js - 系统原生目录选择框（多后端兜底 + 窗口可见性探测）
//
// 供扩展端「切换工作目录」弹窗的「浏览…」按钮调用，仅本机代理（loopback）才有意义：
// 工作目录本就是代理端机器上的路径，远端弹窗用户也看不到（server.js 另有来源 IP 门控）。
//
// 实测发现：Windows 上从 CMD 启动 agent 时能弹窗，从 PowerShell / Git Bash 启动时弹不出来。
// 这说明 powershell.exe + System.Windows.Forms 这条通道本身可用（不是企业策略拦截），
// 问题在父进程环境/进程属性差异。为此这里的兜底必须满足两条：
//   1) 一个后端「窗口没出现」时不能在原地等满 120s，必须快速切到下一个后端；
//   2) 命令查找不能依赖 PATH，也不能依赖环境变量名的大小写。
//
// 后端按序尝试（Windows）：
//   powershell-inline（内联 -Command）→ powershell-encoded（-EncodedCommand）→ cscript-vbs（WSH）
// 每个后端在弹出窗口前先输出 SHOWN_MARKER：收到标记说明窗口已经走到 ShowDialog，
// 收不到说明进程卡在更早的阶段（加载程序集/创建窗口失败），此时杀掉进程换下一个后端。
//
// 稳定性约束（任何一条都不允许打破，否则会拖垮常驻的 agent 进程）：
//   - 本模块对外只 resolve 结果对象，绝不 reject / 绝不抛异常
//   - 子进程有超时强杀 + 强杀后兜底 settle，保证请求不会永久悬挂
//   - 子进程输出有长度上限，防止异常命令刷爆内存
//   - 同一时刻只允许一个选择框，连点不会拉起多个窗口
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// 用户不选时的最长等待
const PICK_TIMEOUT_MS = 120 * 1000;
// 「窗口是否真的弹出来」的判定时限：超时即认为该后端不可用，立刻换下一个
const SHOWN_TIMEOUT_MS = 12 * 1000;
// 整次选择的总预算：3 个后端串行时不能无限拖长（扩展端 200s 兜底在此之后）
const PICK_TOTAL_BUDGET_MS = 180 * 1000;
// 强杀后等待 close 的兜底时长：某些后端被杀后不触发 close，不能因此让请求挂着
const KILL_SETTLE_MS = 2000;
// 窗口已进入显示流程的标记（子进程 stdout 中出现即认为窗口会出现）
const SHOWN_MARKER = '@@AI_HELPER_PICK_SHOWN@@';
// 单个子进程输出上限（字符）
const MAX_STREAM_CHARS = 64 * 1024;
// 回传给扩展端的错误摘要上限（toast 能展示的长度）
const MAX_ERROR_CHARS = 300;
const DEFAULT_TITLE = 'Select folder';

/** 清理标题：去掉会破坏脚本/参数的字符（各后端都把标题拼进脚本或参数） */
function sanitizeTitle(title) {
  return String(title || '')
    .replace(/["'\\`\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || DEFAULT_TITLE;
}

function toBase64Utf8(text) {
  return Buffer.from(String(text), 'utf8').toString('base64');
}

/**
 * 大小写不敏感地读环境变量
 * Windows 环境变量名不区分大小写，但 Node 的 process.env 是普通 JS 对象（区分大小写）：
 * 不同终端下同一个变量可能是 SystemRoot / SYSTEMROOT / systemroot，
 * 只认一种写法会让绝对路径解析失败并静默退化到 PATH 查找（Git Bash 下 PATH 是 POSIX 形式，必然找不到）。
 */
export function readEnvVar(env, name) {
  if (!env || !name) return '';
  const direct = env[name];
  if (typeof direct === 'string' && direct) return direct;
  const lower = name.toLowerCase();
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === lower) {
      const value = env[key];
      if (typeof value === 'string' && value) return value;
    }
  }
  return '';
}

/**
 * 解析 Windows 可执行文件的绝对路径
 * 优先用 %SystemRoot%（大小写不敏感）拼绝对路径，彻底摆脱 Git Bash/MSYS 对 PATH 的改写；
 * 取不到时退回裸命令名，交由 PATH 查找。
 */
function resolveWindowsExe(name, env) {
  const root = readEnvVar(env, 'SystemRoot') || readEnvVar(env, 'windir');
  if (root) {
    // 混用 / 与 \ 会让部分 Windows API 解析失败，统一成反斜杠
    const normalizedRoot = String(root).replace(/\//g, '\\');
    if (name === 'powershell') {
      return path.win32.join(normalizedRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    }
    if (name === 'cscript') {
      return path.win32.join(normalizedRoot, 'System32', 'cscript.exe');
    }
  }
  return `${name}.exe`;
}

/**
 * 解析可用于落临时文件的目录
 * Windows 下优先 %LOCALAPPDATA%\Temp：从 Git Bash 等 MSYS 终端启动时 TEMP/TMP 可能被改写成
 * POSIX 形式（/tmp），直接用 os.tmpdir() 会落到不可写的盘根，导致 VBS 兜底后端静默失效。
 */
export function resolveTmpDir(platform, env = process.env) {
  if (platform === 'win32') {
    const local = readEnvVar(env, 'LOCALAPPDATA');
    if (local) return path.win32.join(String(local).replace(/\//g, '\\'), 'Temp');
    const tmp = readEnvVar(env, 'TEMP') || readEnvVar(env, 'TMP');
    // 只接受驱动器绝对路径，避开 MSYS 风格的 /tmp
    if (tmp && /^[A-Za-z]:[\\/]/.test(tmp)) return tmp;
  }
  return os.tmpdir();
}

/**
 * Windows PowerShell 脚本主体（共享给 -Command / -EncodedCommand 两个后端）
 * - 标题以 base64 传入并在脚本内解码：内联调用时命令行可保持纯 ASCII，避开代码页乱码
 * - 选中路径以 UTF-8 base64 写 stdout：避开中文 Windows 控制台 GBK 输出被按 UTF-8 解码的乱码
 * - 弹出窗口前先输出 SHOWN_MARKER：让调用方能区分「窗口没出现」与「用户还没选」
 * - owner 窗口只用于置顶，拿不到句柄时退回无 owner 调用，不能因此判定整体失败
 * - 退出码约定：0=选中 / 2=用户取消 / 1=异常（异常信息写 stderr）
 */
function buildPowerShellScript(title) {
  const titleB64 = toBase64Utf8(sanitizeTitle(title));
  return [
    `$t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${titleB64}'))`,
    // 注意：各行以 ';' 拼接，块起始行必须直接跟首条语句，不能留下 `{;` 这样的空语句
    '$ErrorActionPreference = \'Stop\'; try { Add-Type -AssemblyName System.Windows.Forms',
    '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$f.Description = $t',
    // owner 只是为了让对话框置顶；某些会话下 Form 句柄创建会失败，这时必须降级而不是整体报错
    '$owner = $null',
    'try { $owner = New-Object System.Windows.Forms.Form; $owner.TopMost = $true; $null = $owner.Handle } catch { $owner = $null }',
    `[Console]::Out.Write('${SHOWN_MARKER}'); [Console]::Out.Flush()`,
    '$r = $null',
    'if ($null -ne $owner) { $r = $f.ShowDialog($owner) } else { $r = $f.ShowDialog() }',
    'if ($r -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($f.SelectedPath))); exit 0 }',
    'exit 2',
    '} catch { [Console]::Error.Write($_.Exception.GetType().Name + \': \' + $_.Exception.Message); exit 1 }',
  ].join('; ');
}

/**
 * VBScript 兜底后端：走 WSH + Shell.Application.BrowseForFolder
 * 与 PowerShell 完全不同的执行通道（不受 PowerShell 执行策略/语言模式影响），
 * 是 -Command 与 -EncodedCommand 双双失效时的第三通路。
 * 脚本本身保持纯 ASCII（英文标题），避免 .vbs 文件编码解析问题；
 * 选中路径写入临时文件（FSO Unicode = UTF-16LE），读回时不依赖控制台代码页。
 */
function buildVbsScript(outputFile) {
  const safeOut = String(outputFile).replace(/"/g, '""');
  return [
    'Option Explicit',
    'On Error Resume Next',
    'Dim sh, folder, picked, fso, ts',
    'picked = ""',
    'Set sh = CreateObject("Shell.Application")',
    'If Err.Number <> 0 Then WScript.Quit 1',
    'Err.Clear',
    `WScript.Echo "${SHOWN_MARKER}"`,
    'Set folder = sh.BrowseForFolder(0, "Select working directory", 65, 0)',
    'If Err.Number <> 0 Then WScript.Quit 1',
    'Err.Clear',
    'If Not folder Is Nothing Then',
    '  If Not folder.Self Is Nothing Then picked = folder.Self.Path',
    'End If',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'If Err.Number <> 0 Then WScript.Quit 1',
    'Err.Clear',
    `Set ts = fso.OpenTextFile("${safeOut}", 2, True, -1)`,
    'If Err.Number <> 0 Then WScript.Quit 1',
    'ts.Write picked',
    'ts.Close',
    'WScript.Quit 0',
    '',
  ].join('\r\n');
}

/** 规整选中路径：去首尾空白与尾部分隔符（根目录 "/" 与 "C:\\" 除外） */
export function normalizePickedPath(raw) {
  let p = String(raw || '').trim();
  while (p.length > 3 && /[\\/]$/.test(p)) p = p.slice(0, -1);
  if (/^[A-Za-z]:$/.test(p)) p += '\\';
  return p;
}

/** 路径合理性校验：排除乱码与控制字符（base64 误解码时会出现） */
function looksLikePath(value) {
  const s = String(value || '').trim();
  if (!s || s.length > 4096) return false;
  if (/[\u0000-\u001f\ufffd]/.test(s)) return false;
  return /[\\/]/.test(s);
}

/** PowerShell 后端：stdout 为 UTF-8 base64 编码的路径（SHOWN_MARKER 行会被自动跳过） */
function decodePowerShellOutput(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return '';
  // 只取最后一行非空内容（防止任何前缀噪声）
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(line) || line.length < 8) continue;
    try {
      const decoded = Buffer.from(line, 'base64').toString('utf8').trim();
      if (looksLikePath(decoded)) return normalizePickedPath(decoded);
    } catch { /* 非法 base64：继续找下一行 */ }
  }
  return '';
}

/** VBS 后端：路径写在临时文件里（FSO 以 UTF-16LE 写入，可能带 BOM） */
function readPickedFile(file) {
  try {
    if (!fs.existsSync(file)) return '';
    let text = fs.readFileSync(file, 'utf16le');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const trimmed = text.trim();
    return looksLikePath(trimmed) ? normalizePickedPath(trimmed) : '';
  } catch {
    return '';
  }
}

/**
 * 构造各平台的目录选择执行计划（按顺序尝试）
 * 每个条目：{ backend, kind, command, args?, expectShown, prepare? }
 *   - expectShown：该后端会在弹窗前输出 SHOWN_MARKER，可据此判定「窗口没出现」
 *   - prepare() 用于需要落临时文件的后端，返回 { args, decode, cleanup, meta } 或 null（准备失败）
 * @param {string} title - 选择框提示文案
 * @param {string} [platform] - 平台标识（默认 process.platform，测试可注入）
 * @param {object} [options] - { env, tmpDir }
 * @returns {Array<object>}
 */
export function buildPickPlan(title, platform = process.platform, options = {}) {
  const env = options.env || process.env;
  const tmpDir = options.tmpDir || resolveTmpDir(platform, env);
  const safeTitle = sanitizeTitle(title);

  if (platform === 'darwin') {
    return [{
      backend: 'osascript',
      kind: 'posix',
      expectShown: false,
      command: 'osascript',
      args: ['-e', `POSIX path of (choose folder with prompt "${safeTitle}")`],
      decode: (r) => (looksLikePath(r.stdout) ? normalizePickedPath(r.stdout) : ''),
    }];
  }

  if (platform === 'win32') {
    const psExe = resolveWindowsExe('powershell', env);
    const cscriptExe = resolveWindowsExe('cscript', env);
    const psScript = buildPowerShellScript(title);
    const psCommon = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA'];

    return [
      {
        // 后端 1：内联 -Command。脚本刻意不含双引号，避免 Node 参数转义与 PowerShell 解析冲突；
        // 同时不经过 -EncodedCommand，绕开 ASR「可疑混淆脚本」规则的拦截。
        backend: 'powershell-inline',
        kind: 'powershell',
        expectShown: true,
        command: psExe,
        args: [...psCommon, '-Command', psScript],
        decode: (r) => decodePowerShellOutput(r.stdout),
      },
      {
        // 后端 2：-EncodedCommand（base64 UTF-16LE），兼容极端转义场景，但可能被安全策略拦
        backend: 'powershell-encoded',
        kind: 'powershell',
        expectShown: true,
        command: psExe,
        args: [...psCommon, '-EncodedCommand', Buffer.from(psScript, 'utf16le').toString('base64')],
        decode: (r) => decodePowerShellOutput(r.stdout),
      },
      {
        // 后端 3：cscript + WSH。完全独立的执行通道，用来覆盖 PowerShell 通道整体不可用的情况
        backend: 'cscript-vbs',
        kind: 'vbs',
        expectShown: true,
        command: cscriptExe,
        prepare() {
          try {
            const dir = fs.mkdtempSync(path.join(tmpDir, 'ai-helper-pick-'));
            const scriptFile = path.join(dir, 'pick.vbs');
            const outputFile = path.join(dir, 'picked.txt');
            fs.writeFileSync(scriptFile, buildVbsScript(outputFile), 'utf8');
            return {
              args: ['//nologo', '//B', scriptFile],
              decode: () => readPickedFile(outputFile),
              cleanup() {
                try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 目录已被清理 */ }
              },
              meta: { scriptFile, outputFile },
            };
          } catch {
            // 临时目录不可写（只读环境/权限受限）：跳过该后端，不影响其它后端
            return null;
          }
        },
      },
    ];
  }

  // Linux / 其他：zenity 优先，kdialog 回退
  return [
    {
      backend: 'zenity',
      kind: 'posix',
      expectShown: false,
      command: 'zenity',
      args: ['--file-selection', '--directory', `--title=${safeTitle}`],
      decode: (r) => (looksLikePath(r.stdout) ? normalizePickedPath(r.stdout) : ''),
    },
    {
      backend: 'kdialog',
      kind: 'posix',
      expectShown: false,
      command: 'kdialog',
      args: ['--getexistingdirectory', '~', '--title', safeTitle],
      decode: (r) => (looksLikePath(r.stdout) ? normalizePickedPath(r.stdout) : ''),
    },
  ];
}

/** 兼容旧调用：返回首选后端 */
export function buildPickCommand(title, platform = process.platform, options = {}) {
  return buildPickPlan(title, platform, options)[0];
}

/** 子进程退出语义 → 统一结果：严格区分「用户取消」与「失败原因」，失败时携带诊断信息 */
function classifyPickResult(runResult, item) {
  const picked = item.decode ? item.decode(runResult) : '';
  if (picked) return { success: true, path: picked, available: true };

  const code = runResult.code;
  const errText = String(runResult.stderr || '').trim();

  if (item.kind === 'powershell' || item.kind === 'vbs') {
    // 退出码是我们自己脚本约定的：2=取消；0=对话框正常关闭但没选
    if (code === 2 || code === 0) return { success: true, path: null, available: true };
    return {
      success: false,
      path: null,
      available: true,
      exitCode: code ?? null,
      error: `exit ${code === null || code === undefined ? 'unknown' : code}${errText ? `: ${errText}` : '（无 stderr）'}`,
    };
  }

  // POSIX：无 stderr 的非零退出、或 stderr 明确是取消 → 视为用户取消
  if (!errText) return { success: true, path: null, available: true };
  if (/cancel|取消|-128/i.test(errText)) return { success: true, path: null, available: true };
  return { success: false, path: null, available: true, exitCode: code ?? null, error: errText };
}

/**
 * 运行单个选择命令，收集 stdout/stderr
 * spawn 失败（ENOENT 等）、超时、被信号杀死等一律以结果对象返回，不抛异常
 * @param {object} opts - { timeoutMs, shownTimeoutMs, expectShown }
 * @returns {Promise<{code?, stdout?, stderr?, timedOut?: boolean, shown?: boolean,
 *   noWindow?: boolean, spawnError?: boolean}>}
 */
function runPickOnce(command, args, opts, spawnImpl) {
  const timeoutMs = opts.timeoutMs;
  const shownTimeoutMs = opts.expectShown ? opts.shownTimeoutMs : 0;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      resolve({ spawnError: true, stderr: String(err?.message || err) });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let shown = !shownTimeoutMs;
    let settled = false;
    let timer = null;
    let shownTimer = null;
    // 强杀时预期的结论（noWindow/超时）：被杀进程通常会立刻触发 close，
    // close 分支必须把这层结论合并进去，否则「窗口没出现」会被误当成普通退出
    let pendingExtra = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (shownTimer) clearTimeout(shownTimer);
      resolve(result);
    };
    // 强杀后兜底 settle：被杀进程若始终不触发 close，也不能让 HTTP 请求挂着
    const killAndSettle = (extra) => {
      pendingExtra = extra;
      try { child.kill(); } catch { /* 进程可能已退出 */ }
      setTimeout(() => finish({ code: null, stdout, stderr, ...extra }), KILL_SETTLE_MS);
    };
    timer = setTimeout(() => {
      timedOut = true;
      killAndSettle({ timedOut: true, shown });
    }, timeoutMs);
    if (shownTimeoutMs) {
      // 窗口迟迟不出现：立刻杀掉换下一个后端，而不是干等满 120s
      shownTimer = setTimeout(() => {
        if (shown) return;
        killAndSettle({ noWindow: true, shown: false });
      }, shownTimeoutMs);
    }
    // 管道自身的 error（EPIPE/ECONNRESET，进程被杀或管道先行关闭时可能出现）必须监听：
    // EventEmitter 的 'error' 事件若无监听者会被抛成 uncaughtException
    child.stdout?.on?.('error', () => {});
    child.stderr?.on?.('error', () => {});
    child.stdout?.on?.('data', (chunk) => {
      if (stdout.length < MAX_STREAM_CHARS) stdout += chunk.toString();
      if (!shown && stdout.includes(SHOWN_MARKER)) {
        shown = true;
        if (shownTimer) clearTimeout(shownTimer);
      }
    });
    child.stderr?.on?.('data', (chunk) => {
      if (stderr.length < MAX_STREAM_CHARS) stderr += chunk.toString();
    });
    // spawn 失败（命令不存在等）以异步 error 事件呈现
    child.on?.('error', (err) => finish({ spawnError: true, stderr: String(err?.message || err) }));
    child.on?.('close', (code) => finish({ code, stdout, stderr, timedOut, shown, ...(pendingExtra || {}) }));
  });
}

/** 把各后端失败原因压缩成一行摘要，供 toast 与日志使用 */
function summarizeAttempts(attempts) {
  const text = attempts
    .filter((a) => a && a.error)
    .map((a) => `${a.backend}: ${a.error}`)
    .join(' ｜ ');
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS)}…` : text;
}

/**
 * 环境快照：失败时随结果返回，便于在没有 Windows 测试机的情况下定位
 * （stdoutIsTTY 是判断「父终端是 mintty 还是 conhost」的关键信号）
 */
function buildEnvironmentSnapshot(platform, env, plan) {
  const pathValue = readEnvVar(env, 'PATH') || readEnvVar(env, 'Path');
  return {
    platform,
    systemRoot: readEnvVar(env, 'SystemRoot') || readEnvVar(env, 'windir') || '(unset)',
    localAppData: readEnvVar(env, 'LOCALAPPDATA') || '(unset)',
    pathStartsWithPosix: Boolean(pathValue) && pathValue.startsWith('/'),
    stdoutIsTTY: Boolean(process.stdout && process.stdout.isTTY),
    tmpDir: resolveTmpDir(platform, env),
    commands: plan.map((p) => p.command),
  };
}

/** 进行中的选择：同一时刻只允许一个窗口，避免连点拉起多个弹窗把 agent 拖住 */
let inFlight = null;

async function doPickDirectory(title, options) {
  const platform = options.platform ?? process.platform;
  const env = options.env || process.env;
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = options.timeoutMs ?? PICK_TIMEOUT_MS;
  const shownTimeoutMs = options.shownTimeoutMs ?? SHOWN_TIMEOUT_MS;
  const totalBudgetMs = options.totalBudgetMs ?? PICK_TOTAL_BUDGET_MS;
  const startedAt = Date.now();

  // 无图形会话的 Linux 直接降级（zenity/kdialog 起不来，只会白白报错）
  if (platform === 'linux') {
    const hasDisplay = options.hasDisplay ?? Boolean(readEnvVar(env, 'DISPLAY') || readEnvVar(env, 'WAYLAND_DISPLAY'));
    if (!hasDisplay) {
      return { success: false, path: null, available: false, error: 'no-display', attempts: [] };
    }
  }

  const plan = buildPickPlan(title, platform, { env, tmpDir: options.tmpDir });
  const environment = buildEnvironmentSnapshot(platform, env, plan);

  const attempts = [];
  let lastTimeout = null;

  for (const item of plan) {
    // 总预算控制：串行三后端最坏情况下也不能无限拖长
    const elapsed = Date.now() - startedAt;
    const remaining = totalBudgetMs - elapsed;
    if (remaining <= 1000) {
      attempts.push({ backend: item.backend, error: 'skipped: 总预算已耗尽' });
      continue;
    }

    let prepared = null;
    try {
      prepared = item.prepare
        ? item.prepare()
        : { args: item.args, decode: item.decode, cleanup: null, meta: null };
    } catch (err) {
      attempts.push({ backend: item.backend, error: `prepare-failed: ${err?.message || err}` });
      continue;
    }
    if (!prepared) {
      attempts.push({ backend: item.backend, error: 'prepare-failed: 临时文件不可写' });
      continue;
    }

    try {
      const r = await runPickOnce(item.command, prepared.args, {
        // 「窗口未出现」的判定时限不能超过剩余预算
        shownTimeoutMs: Math.min(shownTimeoutMs, remaining),
        timeoutMs: Math.min(timeoutMs, remaining),
        expectShown: Boolean(item.expectShown),
      }, spawnImpl);

      if (r.spawnError) {
        // 该命令不可用（未安装/路径不对/无法执行），记录原因后尝试下一个后端
        attempts.push({ backend: item.backend, error: `spawn-failed: ${String(r.stderr || '').slice(0, 160)}` });
        continue;
      }
      if (r.noWindow) {
        // 进程活着但窗口始终没出现（加载程序集失败/会话无桌面等）：换下一个后端，不在这里干等
        attempts.push({ backend: item.backend, error: `no-window-in-${shownTimeoutMs}ms` });
        continue;
      }
      if (r.timedOut) {
        // 能走到这里说明窗口已经进入显示流程，是用户没在时限内选完
        lastTimeout = {
          backend: item.backend,
          detail: String(r.stderr || '').trim().slice(0, 160),
        };
        attempts.push({ backend: item.backend, error: 'timeout: 窗口已显示但未在时限内返回' });
        // 窗口已经出现，继续拉第二个窗口会让人困惑，直接结束
        break;
      }
      const result = classifyPickResult(r, { kind: item.kind, decode: prepared.decode });
      if (result.success) {
        return { ...result, backend: item.backend, attempts };
      }
      attempts.push({ backend: item.backend, exitCode: r.code ?? null, error: result.error });
    } catch (err) {
      // 单个后端内的任何意外都不能中断整体流程，更不能冒泡到 HTTP 层
      attempts.push({ backend: item.backend, error: `unexpected: ${err?.message || err}` });
    } finally {
      try { prepared.cleanup?.(); } catch { /* 清理失败不影响结果 */ }
    }
  }

  const summary = summarizeAttempts(attempts);
  if (lastTimeout) {
    return {
      success: false,
      path: null,
      available: true,
      error: 'timeout',
      backend: lastTimeout.backend,
      detail: lastTimeout.detail || '',
      attempts,
      diagnostics: summary,
      environment,
    };
  }
  // 全部后端都没能弹出窗口：区分「根本没有可用工具」与「工具在但执行失败」
  const noTool = plan.length > 0 && attempts.length === plan.length
    && attempts.every((a) => String(a.error || '').startsWith('spawn-failed'));
  return {
    success: false,
    path: null,
    available: false,
    error: noTool ? `no-dialog-tool: ${summary}` : `all-backends-failed: ${summary}`,
    attempts,
    diagnostics: summary,
    environment,
  };
}

/**
 * 弹出系统原生目录选择框
 * @param {string} [title] - 选择框提示文案
 * @param {object} [options] - spawnImpl / timeoutMs / shownTimeoutMs / totalBudgetMs / platform /
 *   env / tmpDir / hasDisplay（均可注入，便于测试）
 * @returns {Promise<{success: boolean, path: string|null, available: boolean, backend?: string,
 *   error?: string, attempts?: Array<object>, diagnostics?: string, environment?: object}>}
 *   - 选中：{ success: true, path, available: true, backend }
 *   - 用户取消：{ success: true, path: null, available: true }
 *   - 环境不支持：{ success: false, path: null, available: false, error: 'no-dialog-tool: …' | 'no-display' }
 *   - 后端都失败：{ success: false, path: null, available: false, error: 'all-backends-failed: …', attempts }
 *   - 超时：{ success: false, path: null, available: true, error: 'timeout', attempts }
 *   - 已有窗口在等待：{ success: false, path: null, available: true, error: 'busy' }
 * 本函数永不 reject。
 */
export async function pickDirectoryNative(title = '', options = {}) {
  if (inFlight) {
    return { success: false, path: null, available: true, error: 'busy', attempts: [] };
  }
  inFlight = doPickDirectory(title, options || {});
  try {
    return await inFlight;
  } catch (err) {
    // 极限兜底：任何漏网异常都转成结果对象，绝不让 HTTP 层 500 或进程崩溃
    return {
      success: false,
      path: null,
      available: true,
      error: `internal: ${err?.message || err}`,
      attempts: [],
    };
  } finally {
    inFlight = null;
  }
}

/** 测试用：查询是否有选择框正在等待 */
export function isPickInFlight() {
  return Boolean(inFlight);
}

/** 测试用：窗口标记常量 */
export const SHOWN_MARKER_FOR_TEST = SHOWN_MARKER;
