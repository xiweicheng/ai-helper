// agent/src/directory-picker.js - 系统原生目录选择框
// 供扩展端"切换工作目录"弹窗的浏览按钮调用：仅本机代理（loopback）有意义，
// 远端机器可能无桌面环境，弹窗用户也看不到（由 server.js 的来源 IP 门控兜底）。
import { spawn } from 'child_process';

// 选择框悬挂超时：用户长时间不选视为放弃，避免子进程常驻
const PICK_TIMEOUT_MS = 120 * 1000;

/**
 * 构造各平台的目录选择命令
 * @param {string} title - 选择框提示文案
 * @param {string} [platform] - 平台标识（默认 process.platform，测试可注入）
 * @returns {{command: string, args: string[], fallback?: {command: string, args: string[]}}}
 */
export function buildPickCommand(title, platform = process.platform) {
  // 各命令均以参数数组形式传入（不经 shell），这里仅清理标题中的引号防止脚本注入
  const safeTitle = String(title || '').replace(/["'\\`]/g, '').trim() || 'Select folder';

  if (platform === 'darwin') {
    return {
      command: 'osascript',
      args: ['-e', `POSIX path of (choose folder with prompt "${safeTitle}")`],
    };
  }

  if (platform === 'win32') {
    // FolderBrowserDialog 需要 STA 线程；TopMost owner 防止对话框被主窗口遮挡
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$f = New-Object System.Windows.Forms.FolderBrowserDialog",
      `$f.Description = '${safeTitle}'`,
      "$owner = New-Object System.Windows.Forms.Form -Property @{TopMost = $true}",
      "if ($f.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.SelectedPath) }",
    ].join('; ');
    // EncodedCommand（base64 UTF-16LE）避免命令行转义问题
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded],
    };
  }

  // Linux / 其他：zenity 优先，kdialog 回退
  return {
    command: 'zenity',
    args: ['--file-selection', '--directory', `--title=${safeTitle}`],
    fallback: {
      command: 'kdialog',
      args: ['--getexistingdirectory', '~', '--title', safeTitle],
    },
  };
}

/** 规整选中路径：去首尾空白与 osascript POSIX path 的尾斜杠（根目录 "/" 除外） */
function normalizePickedPath(raw) {
  let p = String(raw || '').trim();
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * 运行单个选择命令，收集 stdout；spawn 失败（ENOENT 等）与超时均以结果对象返回，不抛异常
 */
function runPickOnce(command, args, timeoutMs, spawnImpl) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      resolve({ spawnError: true, stderr: String(err?.message || err) });
      return;
    }
    let stdout = '';
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* 进程已退出 */ }
    }, timeoutMs);
    child.stdout?.on?.('data', (d) => { stdout += d; });
    child.stderr?.on?.('data', () => {});
    // spawn 失败（命令不存在等）以异步 error 事件呈现
    child.on?.('error', (err) => finish({ spawnError: true, stderr: String(err?.message || err) }));
    child.on?.('close', (code) => finish({ code, stdout, stderr: '', timedOut }));
  });
}

/**
 * 弹出系统原生目录选择框
 * @param {string} [title] - 选择框提示文案
 * @param {object} [options] - spawnImpl（测试注入）/ timeoutMs / platform（测试注入）/ hasDisplay（测试注入，Linux 无图形会话判定）
 * @returns {Promise<{success: boolean, path: string|null, available: boolean, error?: string}>}
 *   - 选中：{ success: true, path, available: true }
 *   - 用户取消：{ success: true, path: null, available: true }
 *   - 环境不支持（命令不存在/无图形会话）：{ success: false, path: null, available: false }
 *   - 超时等其他错误：{ success: false, path: null, available: true, error }
 */
export async function pickDirectoryNative(title = '', options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = options.timeoutMs ?? PICK_TIMEOUT_MS;
  const platform = options.platform ?? process.platform;
  const hasDisplay = options.hasDisplay ?? Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

  // 无图形会话的 Linux 直接降级（zenity/kdialog 起不来，只会白白报错）
  if (platform === 'linux' && !hasDisplay) {
    return { success: false, path: null, available: false, error: 'no-display' };
  }

  const plan = buildPickCommand(title, platform);
  const attempts = plan.fallback ? [plan, plan.fallback] : [plan];

  for (const { command, args } of attempts) {
    const r = await runPickOnce(command, args, timeoutMs, spawnImpl);
    if (r.spawnError) continue; // 该命令不可用，尝试回退
    if (r.timedOut) {
      return { success: false, path: null, available: true, error: 'timeout' };
    }
    const path = normalizePickedPath(r.stdout);
    if (path) {
      return { success: true, path, available: true };
    }
    // 空输出（无论退出码）：用户取消选择
    return { success: true, path: null, available: true };
  }

  // 所有候选命令均不可用
  return { success: false, path: null, available: false, error: 'no-dialog-tool' };
}
