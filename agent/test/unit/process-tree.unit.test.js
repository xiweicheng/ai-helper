// 单元测试：进程树终止工具（R1/R3 修复的基础设施）
// 覆盖：整组终止（含孙进程）、非组长回退单进程终止、SIGTERM 忽略升级 SIGKILL、已退出/非法入参安全返回
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { killProcessTree, stopProcessTree } from '../../src/process-tree.js';

const isWin = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitGone(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await sleep(50);
  }
  return !isAlive(pid);
}

function waitOutput(child, marker, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`等待输出超时: ${marker}`)), timeoutMs);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      if (buf.includes(marker)) { clearTimeout(timer); resolve(buf); }
    });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function spawnNode(script, { detached = true } = {}) {
  return spawn(process.execPath, ['-e', script], { detached, stdio: ['ignore', 'pipe', 'ignore'] });
}

function forceKill(child, pid) {
  if (child) { try { child.kill('SIGKILL'); } catch {} }
  if (pid) {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
}

// 父进程（组长）再 spawn 一个长睡孙进程，打印孙进程 pid 后自身长睡
const GRAND_SLEEP_SCRIPT = `
const { spawn } = require('child_process');
const grand = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
console.log('GRAND_PID=' + grand.pid);
setTimeout(() => {}, 60000);
`;

describe('killProcessTree', () => {
  test('终止整个进程组（直接子进程与孙进程一并退出）', { skip: isWin, timeout: 15000 }, async () => {
    const child = spawnNode(GRAND_SLEEP_SCRIPT);
    let grandPid = null;
    try {
      const out = await waitOutput(child, 'GRAND_PID=');
      grandPid = Number(out.match(/GRAND_PID=(\d+)/)[1]);
      assert.ok(grandPid > 0 && isAlive(grandPid), '孙进程应在运行');

      killProcessTree(child, 'SIGTERM');
      assert.equal(await waitGone(child.pid), true, '直接子进程应被终止');
      assert.equal(await waitGone(grandPid), true, '孙进程应随进程组一并终止（组杀）');
    } finally {
      forceKill(child, grandPid);
    }
  });

  test('子进程非进程组组长时回退单进程终止', { skip: isWin, timeout: 15000 }, async () => {
    const child = spawnNode(`console.log('READY'); setTimeout(() => {}, 60000)`, { detached: false });
    try {
      await waitOutput(child, 'READY');
      killProcessTree(child, 'SIGTERM');
      assert.equal(await waitGone(child.pid), true);
    } finally {
      forceKill(child, null);
    }
  });

  test('空/非法入参安全返回', async () => {
    assert.doesNotThrow(() => killProcessTree(null));
    assert.doesNotThrow(() => killProcessTree(undefined, 'SIGKILL'));
  });
});

describe('stopProcessTree', () => {
  test('忽略 SIGTERM 的进程被 SIGKILL 升级终止', { skip: isWin, timeout: 15000 }, async () => {
    const child = spawnNode(`
      process.on('SIGTERM', () => {});
      console.log('READY');
      setTimeout(() => {}, 60000);
    `);
    try {
      await waitOutput(child, 'READY');
      await stopProcessTree(child, { graceMs: 500 });
      assert.equal(await waitGone(child.pid), true, '应升级 SIGKILL 完成终止');
    } finally {
      forceKill(child, null);
    }
  });

  test('进程已退出时立即返回（等待时长远小于 grace）', { skip: isWin, timeout: 15000 }, async () => {
    const child = spawnNode(`process.exit(0)`);
    await new Promise((resolve) => child.on('close', resolve));
    const t0 = Date.now();
    await stopProcessTree(child, { graceMs: 5000 });
    assert.ok(Date.now() - t0 < 2000, '不应等待完整 grace 时长');
  });

  test('空/非法入参安全返回', async () => {
    await stopProcessTree(null);
    await stopProcessTree(undefined, { graceMs: 10 });
  });
});
