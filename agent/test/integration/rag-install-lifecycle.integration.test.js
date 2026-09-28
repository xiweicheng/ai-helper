// 集成测试：RAG 依赖安装生命周期（R1/R3）
// 隔离：临时 HOME（状态文件写入 ~/.ai-helper-agent/）+ PATH 前置假 npm（可控生命周期、可断言终止）
// 覆盖：启动即持久化 running、stopRagInstall 终止进程树并收敛中止态、幂等、重复启动互斥、重启恢复收敛
// 注意：HOME 必须在动态 import install.js 之前设置（状态文件路径在模块加载时求值）
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 隔离环境（临时 HOME + 假 npm） ----------
const home = await mkdtemp(join(tmpdir(), 'rag-install-life-'));
const fakeBin = join(home, 'fakebin');
const npmPidLog = join(home, 'npm-pids.log');
const STATE_FILE = join(home, '.ai-helper-agent', 'rag-install-state.json');

await mkdir(fakeBin, { recursive: true });
await writeFile(join(fakeBin, 'npm'), `#!/bin/sh
echo "$$" >> "${npmPidLog}"
sleep 4
`, 'utf-8');
await chmod(join(fakeBin, 'npm'), 0o755);

process.env.HOME = home;
process.env.PATH = `${fakeBin}:${process.env.PATH}`;

let importSeq = 0;
// 每次动态 import 得到全新模块实例（模块级 installTask 隔离），模拟进程重启后的重新加载
const importFresh = () => import(`../../src/rag/install.js?case=${++importSeq}`);

const tStub = (key) => key;

// ---------- 辅助 ----------
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitFor(fn, timeoutMs = 5000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  let v = await fn();
  while (!v && Date.now() < deadline) {
    await sleep(intervalMs);
    v = await fn();
  }
  return v;
}

const waitGone = (pid, timeoutMs = 5000) => waitFor(() => !isAlive(pid), timeoutMs);

async function readState() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf-8')); } catch { return null; }
}

async function npmPids() {
  try {
    return (await readFile(npmPidLog, 'utf-8')).trim().split('\n').filter(Boolean).map(Number);
  } catch { return []; }
}

// 等待出现新的 npm 进程并返回其 pid（prevCount 为启动前的记录数）
async function waitNewNpmPid(prevCount) {
  const pids = await waitFor(async () => {
    const all = await npmPids();
    return all.length > prevCount ? all : null;
  });
  assert.ok(pids && pids.length > prevCount, '假 npm 应已启动并记录 pid');
  return pids[pids.length - 1];
}

// 用例收尾：优先走 stopRagInstall（GREEN 后），并兜底裸杀进程组（防测试环境残留）
async function cleanupInstall(mod, pid) {
  if (mod && typeof mod.stopRagInstall === 'function') {
    try { await mod.stopRagInstall(); } catch {}
  }
  if (pid) {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try { process.kill(pid, 'SIGKILL'); } catch {}
    await waitGone(pid, 3000);
  }
}

after(async () => {
  for (const pid of await npmPids()) {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
  await rm(home, { recursive: true, force: true }).catch(() => {});
});

describe('RAG 安装生命周期（R1/R3）', () => {
  test('启动安装：running 状态持久化到状态文件', { timeout: 20000 }, async () => {
    const mod = await importFresh();
    const base = (await npmPids()).length;
    const r = mod.startRagInstall(tStub);
    assert.equal(r.started, true);

    const st = mod.getRagInstallStatus();
    assert.equal(st.running, true);
    assert.equal(st.done, false);
    assert.equal(st.phase, 'installing');

    const persisted = await waitFor(async () => (await readState())?.running === true, 3000);
    assert.equal(persisted, true, '状态文件应记录 running=true（重启后可见）');

    const pid = await waitNewNpmPid(base);
    await cleanupInstall(mod, pid);
  });

  test('stopRagInstall：终止 npm 进程树并收敛为「已中止」', { timeout: 20000 }, async () => {
    const mod = await importFresh();
    const base = (await npmPids()).length;
    assert.equal(mod.startRagInstall(tStub).started, true);
    const pid = await waitNewNpmPid(base);
    assert.ok(isAlive(pid), 'npm 应在运行');

    const stopped = await mod.stopRagInstall();
    assert.equal(stopped, true, '应报告中止了运行中的安装');
    assert.equal(await waitGone(pid), true, 'npm 进程应被终止（R1/R3）');

    const st = mod.getRagInstallStatus();
    assert.equal(st.running, false);
    assert.equal(st.done, true);
    assert.equal(st.success, false);
    assert.equal(st.phase, 'done');
    assert.ok(st.error, '中止应带错误说明');

    const persisted = await waitFor(async () => {
      const s = await readState();
      return Boolean(s && s.running === false && s.done === true && s.success === false);
    }, 3000);
    assert.equal(persisted, true, '状态文件应同步收敛为已中止');
  });

  test('stopRagInstall 幂等：无运行任务时返回 false 且安全', { timeout: 10000 }, async () => {
    const mod = await importFresh();
    assert.equal(await mod.stopRagInstall(), false);
    assert.equal(await mod.stopRagInstall(), false);
  });

  test('运行中重复启动被拒绝，且不拉起第二个 npm', { timeout: 20000 }, async () => {
    const mod = await importFresh();
    const base = (await npmPids()).length;
    assert.equal(mod.startRagInstall(tStub).started, true);
    const pid = await waitNewNpmPid(base);

    const dup = mod.startRagInstall(tStub);
    assert.equal(dup.started, false);
    assert.ok(dup.error);

    await sleep(300);
    assert.equal((await npmPids()).length, base + 1, '被拒绝的启动不应拉起第二个 npm');
    await cleanupInstall(mod, pid);
  });

  test('重启恢复：上次 running 状态收敛为已中止（R3）', { timeout: 20000 }, async () => {
    // 实例 A 启动安装后模拟进程被杀：弃用实例、不调 stop（npm 仍在运行）
    const modA = await importFresh();
    const base = (await npmPids()).length;
    assert.equal(modA.startRagInstall(tStub).started, true);
    const pid = await waitNewNpmPid(base);
    await waitFor(async () => (await readState())?.running === true, 3000);

    // 实例 B 模拟重启后新进程加载：应读取状态文件并把「运行中」收敛为「已中止」
    const modB = await importFresh();
    const st = modB.getRagInstallStatus();
    assert.equal(st.running, false, '重启后不应仍标记运行中');
    assert.equal(st.done, true);
    assert.equal(st.success, false);
    assert.ok(st.error, '收敛状态应带中止说明');

    const persisted = await waitFor(async () => (await readState())?.running === false, 3000);
    assert.equal(persisted, true, '收敛后的状态应回写状态文件');

    await cleanupInstall(null, pid); // 旧实例遗留 npm 的测试侧清理
  });
});
