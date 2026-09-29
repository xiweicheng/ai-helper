// 集成测试：启动时自动恢复 RAG 依赖（npm -g 更新代理会清空包目录内手动安装的依赖）
// 隔离：临时 HOME（状态文件写入 ~/.ai-helper-agent/）+ PATH 前置假 npm（sleep 版 / 快速成功版）
// 覆盖：无历史不触发、有历史触发（trigger=auto）、旧格式兼容固化、运行中不重复、成功安装写入 everSucceeded
// 注意：HOME 必须在动态 import install.js 之前设置（状态文件路径在模块加载时求值）
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 隔离环境（临时 HOME + 双假 npm） ----------
const home = await mkdtemp(join(tmpdir(), 'rag-auto-restore-'));
const fakeBin = join(home, 'fakebin'); // sleep 版：可控生命周期、可断言进程终止
const fastBin = join(home, 'fastbin'); // 快速成功版：exit 0，用于验证「安装成功」路径
const npmPidLog = join(home, 'npm-pids.log');
const STATE_FILE = join(home, '.ai-helper-agent', 'rag-install-state.json');

await mkdir(fakeBin, { recursive: true });
await mkdir(fastBin, { recursive: true });
await writeFile(join(fakeBin, 'npm'), `#!/bin/sh
echo "$$" >> "${npmPidLog}"
sleep 4
`, 'utf-8');
await chmod(join(fakeBin, 'npm'), 0o755);
await writeFile(join(fastBin, 'npm'), `#!/bin/sh
echo "added 6 packages in 1s"
exit 0
`, 'utf-8');
await chmod(join(fastBin, 'npm'), 0o755);

const origPath = process.env.PATH;
process.env.HOME = home;
process.env.PATH = `${fakeBin}:${origPath}`;

const agentRoot = fileURLToPath(new URL('../../', import.meta.url));
// 成功路径验证需要真实可加载的 RAG 依赖（repo agent/node_modules 内）
const hasRagDeps = existsSync(join(agentRoot, 'node_modules', 'vectra'));

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

async function writeState(obj) {
  await mkdir(join(home, '.ai-helper-agent'), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(obj), 'utf-8');
}

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

// 用例收尾：优先走 stopRagInstall，并兜底裸杀进程组（防测试环境残留）
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

// 成功安装过的状态文件（everSucceeded 标记 = 自动恢复的判定依据）
const succeededState = () => ({
  running: false,
  done: true,
  success: true,
  everSucceeded: true,
  phase: 'done',
  logTail: ['added 174 packages in 11s'],
  startedAt: 1,
  finishedAt: 2,
  error: null,
});

after(async () => {
  for (const pid of await npmPids()) {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
  await rm(home, { recursive: true, force: true }).catch(() => {});
});

describe('RAG 启动自动恢复（代理更新后依赖被 npm 清理）', () => {
  test('无历史安装记录：不自动恢复、不拉起 npm', { timeout: 10000 }, async () => {
    await rm(STATE_FILE, { force: true });
    const mod = await importFresh();
    const r = mod.maybeAutoRestoreRagDeps();
    assert.equal(r.started, false);
    assert.equal(r.reason, 'no-history');
    await sleep(300);
    assert.equal((await npmPids()).length, 0, '无历史时不应拉起 npm');
  });

  test('曾成功安装过：启动时自动恢复（trigger=auto）', { timeout: 20000 }, async () => {
    await writeState(succeededState());
    const mod = await importFresh();
    const base = (await npmPids()).length;

    const r = mod.maybeAutoRestoreRagDeps();
    assert.equal(r.started, true, '有历史成功记录时应自动恢复');
    assert.equal(mod.getRagInstallStatus().trigger, 'auto', '任务应标记为自动触发');

    const pid = await waitNewNpmPid(base);
    await cleanupInstall(mod, pid);
  });

  test('旧格式兼容：npm 已完成但验证误报的失败记录也应自动恢复', { timeout: 20000 }, async () => {
    // 复现 R8 受害用户的历史状态：npm 实际装好（up to date），但进程内验证误报失败
    await writeState({
      running: false,
      done: true,
      success: false,
      phase: 'done',
      logTail: ['up to date in 820ms'],
      startedAt: 1790665343764,
      finishedAt: 1790665344822,
      error: 'npm 安装完成，但依赖验证未通过',
    });
    const mod = await importFresh();
    const base = (await npmPids()).length;

    const r = mod.maybeAutoRestoreRagDeps();
    assert.equal(r.started, true, 'npm 实质完成过安装的失败记录也应触发自动恢复');

    const settled = await waitFor(async () => (await readState())?.everSucceeded === true, 3000);
    assert.equal(settled, true, '兼容判定应固化为 everSucceeded 并回写状态文件');

    const pid = await waitNewNpmPid(base);
    await cleanupInstall(mod, pid);
  });

  test('已有运行中任务：不重复触发，且手动任务不丢失历史标记', { timeout: 20000 }, async () => {
    await writeState(succeededState());
    const mod = await importFresh();
    const base = (await npmPids()).length;

    assert.equal(mod.startRagInstall(tStub).started, true);
    const pid = await waitNewNpmPid(base);
    await waitFor(async () => (await readState())?.running === true, 3000);
    assert.equal((await readState())?.everSucceeded, true, '手动任务不应丢失历史成功标记');

    const r = mod.maybeAutoRestoreRagDeps();
    assert.equal(r.started, false);
    assert.equal(r.reason, 'running');

    await sleep(300);
    assert.equal((await npmPids()).length, base + 1, '不应拉起第二个 npm');
    await cleanupInstall(mod, pid);
  });

  test('安装成功：everSucceeded 持久化到状态文件', { timeout: 60000, skip: !hasRagDeps ? 'repo agent/node_modules 未安装 RAG 依赖' : false }, async (t) => {
    // 预检：当前环境探测必须能通过（依赖真实可加载），否则无法验证成功路径
    const detectMod = await import('../../src/rag/detect.js');
    detectMod.resetRagDetection();
    const probeOk = await detectMod.detectRagAvailable();
    if (!probeOk) {
      t.skip('当前环境 RAG 依赖探测不通过，跳过成功路径验证');
      return;
    }

    await rm(STATE_FILE, { force: true });
    const mod = await importFresh();
    process.env.PATH = `${fastBin}:${origPath}`; // 切换为快速成功版 npm
    try {
      assert.equal(mod.startRagInstall(tStub).started, true);
      const done = await waitFor(async () => {
        const st = mod.getRagInstallStatus();
        return st.done ? st : null;
      }, 30000);
      assert.equal(done.success, true, `安装应成功（error=${done.error}）`);
      assert.equal(done.trigger, 'manual');

      const persisted = await waitFor(async () => (await readState())?.everSucceeded === true, 3000);
      assert.equal(persisted, true, '成功安装后 everSucceeded 应持久化');
    } finally {
      process.env.PATH = `${fakeBin}:${origPath}`;
    }
  });
});
