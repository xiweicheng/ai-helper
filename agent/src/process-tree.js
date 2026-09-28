// agent/src/process-tree.js - 进程树终止工具（R1/R3）
//
// 用途：npm 等会派生孙进程（下载/编译子任务）的子进程，单发 child.kill() 只命中
// 直接子进程，孙进程会变孤儿继续写磁盘。本模块提供整树终止能力。
// 语义（与 executor.js killProcess 一致）：
//   - POSIX：优先对进程组发信号（要求 spawn 时 detached: true 使子进程成为组长），
//     组不存在（非组长）时回退单进程终止
//   - Windows：taskkill /T 终止整个进程树，SIGKILL 对应 /F 强制

import { spawn } from 'child_process';

/**
 * 终止子进程及其整棵进程树（同步、尽力而为；不等待进程真正退出）
 * @param {import('child_process').ChildProcess} child
 * @param {NodeJS.Signals} [signal] - 'SIGTERM'（默认）或 'SIGKILL'
 * @returns {boolean} 是否成功发出终止信号
 */
export function killProcessTree(child, signal = 'SIGTERM') {
  if (!child || typeof child.pid !== 'number' || child.pid <= 0) return false;

  if (process.platform === 'win32') {
    // /T 递归终止整个进程树；/F 强制（对应 SIGKILL）
    const args = ['/T', '/PID', String(child.pid)];
    if (signal === 'SIGKILL') args.unshift('/F');
    try {
      const killer = spawn('taskkill', args, { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => {});
      killer.unref();
      return true;
    } catch {
      return false;
    }
  }

  // POSIX：负 PID 表示向整个进程组发信号
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch {
    try { return child.kill(signal); } catch { return false; }
  }
}

/**
 * 终止子进程并等待其退出：SIGTERM → graceMs → SIGKILL → 兜底返回
 * @param {import('child_process').ChildProcess} child
 * @param {{graceMs?: number}} [options]
 * @returns {Promise<void>} 进程退出（或兜底超时）后 resolve，不会 reject
 */
export function stopProcessTree(child, { graceMs = 5000 } = {}) {
  return new Promise((resolve) => {
    if (!child || typeof child.pid !== 'number' || child.pid <= 0) return resolve();
    if (child.exitCode !== null || child.signalCode !== null) return resolve();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(killTimer);
      clearTimeout(hardTimer);
      resolve();
    };
    child.once('close', finish);
    child.once('error', finish);

    killProcessTree(child, 'SIGTERM');
    const killTimer = setTimeout(() => killProcessTree(child, 'SIGKILL'), graceMs);
    killTimer.unref();
    // 兜底：close 迟迟不来（异常句柄状态）时避免调用方永久挂起
    const hardTimer = setTimeout(finish, graceMs + 5000);
    hardTimer.unref();
  });
}
