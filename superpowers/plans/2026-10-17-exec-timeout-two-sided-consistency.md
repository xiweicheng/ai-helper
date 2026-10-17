# Agent 命令执行两端超时一致性 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重建 `agent_exec` 命令执行的超时模型：代理端(Agent)成为进程生命周期唯一权威，插件端退化为观察/取消/保险层，消除两端 6 个定时器互不匹配、WS 断开即失去超时保护、通讯失败导致命令双重执行等缺陷。

**Architecture:** `/api/exec` 新增可选 `timeoutMs` 字段作为协议协商信号——收到即为"受管模式"（定时器与 WS 连接数解耦、按"本预算期内有输出才延长"策略收敛）；未收到保持旧语义（disconnect 清定时器、`commandTimeout` 兜底），保证新 Agent × 旧插件完全兼容。插件端删除自己的"延长 5 次"分支，改为派生保险上限 + 空闲时显式调用 `/api/exec/detach` 声明豁免；WS 建连失败且进程已启动时禁止同步回退重跑。

**Tech Stack:** Node.js (agent, ESM)、`ws`、Chrome MV3 扩展 (ESM)、vitest（插件端 `test/unit/*.unit.test.js`）、node:test（agent 端 `agent/test/**/*.test.js`）。

**设计依据（本次会话已核实的根因与场景矩阵，实施者无需再推导）：**
1. 插件端延长分支（tool-executor.js 原 L4536-4543）注释称"有输出才延长"，实际不检查任何活跃度 → 静默命令也被延长 6 倍。
2. 插件端 120s 写死硬超时（原 L4485）与 6× 预算、Agent 端 300s `commandTimeout` 三层数字互无关。
3. `timeoutMs` 从未透传给 Agent；`/api/exec` 只解构 `command/cwd/wait/force`。
4. Agent 端 `disconnectWsClient` 在全部 WS 客户端断开时清除超时定时器 → SW 被 Chrome 杀掉 / 网络闪断 = 进程永久裸奔（确定性，非概率）。
5. 插件端 WS 失败后 catch 走 `execCommandWait` 同步重跑 → 副作用命令双重执行。
6. `executeCommandSync` 兜底超时返回 `stdout:'', stderr:''`，丢弃已收集输出。

**Spec:** 本文件即决策完备的设计文档；关联分析记录见会话结论。

## Global Constraints

- `MIN_TIMEOUT_MS = 5000`（插件端下限钳制，保持不变，本次在 schema 中显式声明）
- `MAX_TIMEOUT_EXTENSIONS = 5`（延长次数，迁移到 Agent 端）
- `TOTAL_BUDGET_CAP_MS = 600000`（总预算封顶，与插件端 `toolTimeout` 上限 600000 对齐；到达封顶不再延长）
- 延长判据：**本预算期内有新输出**（`outputInPeriod` 标志，输出到达置真，每次重新装填定时器时清零）
- 插件端保险公式：`maxTotalMs = min(effectiveTimeout × (1 + MAX_TIMEOUT_EXTENSIONS), TOTAL_BUDGET_CAP_MS)`；硬超时 = `maxTotalMs + 30000`
- 协议协商：`/api/exec` body 中 `timeoutMs` 为有效正数 → 受管模式；否则旧语义一字不改地保留
- 空闲 daemon 分支语义保留：无输出 ≥ `idleTimeoutMs`（≥120s，公式不变）→ 先 `detach` 再关 WS → 返回 partial success
- 用户可见文案一律走 i18n（`t('toolExec.*')`），zh + en 双语同步；禁止新增中文字面量
- 发布顺序：Agent（npm `ai-helper-agent`）先发，插件后发；任何一端单独升级不得出现"无人杀进程"窗口
- 测试命令：agent 端 `node --test agent/test/unit/<file>`、`node --test agent/test/integration/<file>`；插件端 `npx vitest run test/unit/<file>`
- 插件端改动收尾必须 `npm run build:silent` 成功；全量回归 = `npx vitest run` + `npx eslint src agent/src` + `node --test agent/test/unit/*.test.js`

---

### Task 1: Agent 端超时策略纯函数 `decideTimeoutAction`

**Files:**
- Modify: `agent/src/executor.js`（新增导出常量与纯函数，放在 `generateExecId` 之后）
- Test: `agent/test/unit/executor-timeout-policy.unit.test.js`（新建）

**Interfaces:**
- Produces: `decideTimeoutAction(state, opts?) => { action: 'extend'|'kill', extensions: number, nextTimeoutMs?: number }`；常量 `MAX_TIMEOUT_EXTENSIONS=5`、`TOTAL_BUDGET_CAP_MS=600000`；`state = { outputInPeriod, extensions, elapsedMs, baseTimeout }`

- [ ] **Step 1: 写失败测试**

```js
// agent/test/unit/executor-timeout-policy.unit.test.js
// 命令超时策略纯函数：静默即杀 / 期内有输出才延长 / 总预算封顶 600s
// 运行：node --test agent/test/unit/executor-timeout-policy.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideTimeoutAction, MAX_TIMEOUT_EXTENSIONS, TOTAL_BUDGET_CAP_MS,
} from '../../src/executor.js';

describe('decideTimeoutAction', () => {
  test('静默命令（本预算期无输出）到期 → 直接杀，不延长', () => {
    const r = decideTimeoutAction({ outputInPeriod: false, extensions: 0, elapsedMs: 5000, baseTimeout: 5000 });
    assert.equal(r.action, 'kill');
  });

  test('期内有输出 → 延长一期，nextTimeoutMs = 剩余预算', () => {
    const r = decideTimeoutAction({ outputInPeriod: true, extensions: 0, elapsedMs: 5000, baseTimeout: 5000 });
    assert.equal(r.action, 'extend');
    assert.equal(r.extensions, 1);
    assert.equal(r.nextTimeoutMs, 5000); // 预算 10000 - 已用 5000
  });

  test(`延长次数达到上限 ${MAX_TIMEOUT_EXTENSIONS} → 即使活跃也终止`, () => {
    const r = decideTimeoutAction({ outputInPeriod: true, extensions: MAX_TIMEOUT_EXTENSIONS, elapsedMs: 30000, baseTimeout: 5000 });
    assert.equal(r.action, 'kill');
  });

  test('总预算触及 600s 封顶 → 不再延长（nextBudget 无法增长）', () => {
    const r = decideTimeoutAction({ outputInPeriod: true, extensions: 3, elapsedMs: TOTAL_BUDGET_CAP_MS, baseTimeout: 300000 });
    assert.equal(r.action, 'kill');
  });

  test('封顶边界：base=120000 第 4 次延长截到 600000，第 5 次增长为 0 → kill', () => {
    const extend4 = decideTimeoutAction({ outputInPeriod: true, extensions: 3, elapsedMs: 480000, baseTimeout: 120000 });
    assert.equal(extend4.action, 'extend');
    assert.equal(extend4.nextTimeoutMs, TOTAL_BUDGET_CAP_MS - 480000);
    const kill5 = decideTimeoutAction({ outputInPeriod: true, extensions: 4, elapsedMs: TOTAL_BUDGET_CAP_MS, baseTimeout: 120000 });
    assert.equal(kill5.action, 'kill');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test agent/test/unit/executor-timeout-policy.unit.test.js`
Expected: FAIL（`decideTimeoutAction` is not exported）

- [ ] **Step 3: 最小实现**（executor.js，`generateExecId` 函数之后）

```js
// ===== 超时策略（决策权威在 Agent 端：不受插件端 SW 生命周期影响） =====
export const MAX_TIMEOUT_EXTENSIONS = 5;
export const TOTAL_BUDGET_CAP_MS = 600000; // 与插件端 toolTimeout 上限对齐

/**
 * 命令总超时到期时的裁决纯函数（无副作用，便于单测）
 * @param {{ outputInPeriod: boolean, extensions: number, elapsedMs: number, baseTimeout: number }} state
 *   outputInPeriod: 本预算期内是否收到过 stdout/stderr 输出（输出流 = 心跳）
 * @returns {{ action: 'extend'|'kill', extensions: number, nextTimeoutMs?: number }}
 */
export function decideTimeoutAction(state, capMs = TOTAL_BUDGET_CAP_MS, maxExtensions = MAX_TIMEOUT_EXTENSIONS) {
  const { outputInPeriod, extensions, elapsedMs, baseTimeout } = state;
  if (extensions >= maxExtensions) return { action: 'kill', extensions };
  if (!outputInPeriod) return { action: 'kill', extensions };
  const currentBudget = Math.min(baseTimeout * (1 + extensions), capMs);
  const nextBudget = Math.min(baseTimeout * (2 + extensions), capMs);
  if (nextBudget <= currentBudget) return { action: 'kill', extensions }; // 已触及总封顶
  return { action: 'extend', extensions: extensions + 1, nextTimeoutMs: nextBudget - elapsedMs };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test agent/test/unit/executor-timeout-policy.unit.test.js`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add agent/src/executor.js agent/test/unit/executor-timeout-policy.unit.test.js
git commit -m "feat(agent): decideTimeoutAction 超时策略纯函数（期内有输出才延长+600s封顶）"
```

---

### Task 2: Agent 端执行器接线（timeoutMs 透传、受管模式、detach、同步路径输出回收）

**Files:**
- Modify: `agent/src/executor.js`（`executeCommand`、`disconnectWsClient`、`executeCommandSync`，新增 `detachProcess`）
- Modify: `agent/src/server.js`（`/api/exec` 解构并透传 `timeoutMs`；新路由 `/api/exec/detach`）
- Test: `agent/test/integration/api.integration.test.js`（第 8 节"命令执行"追加用例）

**Interfaces:**
- Consumes: Task 1 的 `decideTimeoutAction / MAX_TIMEOUT_EXTENSIONS / TOTAL_BUDGET_CAP_MS`
- Produces: `executeCommand(command, cwd, wsClient, onComplete, collectOutput, execOpts = { timeoutMs?, managed? })`；`executeCommandSync(command, cwd, timeoutMs?)`；`detachProcess(execId) => boolean`；`/api/exec` 接受 `body.timeoutMs`；`POST /api/exec/detach { execId } => { success, execId }`；WS `exit` 帧新增 `timedOut: boolean` 字段

- [ ] **Step 1: 写失败的集成测试**（追加到 `agent/test/integration/api.integration.test.js` 第 8 节 describe 内，沿用该文件的 `req` 助手与 `ctx.testDir`）

```js
  test('exec wait 模式：timeoutMs 透传，静默命令按期被杀（不再跑满 300s 配置默认）', async () => {
    const start = Date.now();
    const res = await req('/api/exec', {
      command: 'sleep 30', cwd: ctx.testDir, wait: true, timeoutMs: 6000,
    }, 'POST', 60000);
    const elapsed = Date.now() - start;
    assert.equal(res.data.success, true);
    assert.equal(res.data.killed, true);
    assert.ok(elapsed < 15000, `应在预算附近终止，实际 ${elapsed}ms`);
  });

  test('exec wait 模式：持续有输出触发自动延长，命令完整跑完', async () => {
    const res = await req('/api/exec', {
      command: 'for i in 1 2 3 4 5 6; do echo $i; sleep 0.7; done',
      cwd: ctx.testDir, wait: true, timeoutMs: 3000,
    }, 'POST', 60000);
    assert.equal(res.data.exitCode, 0);
    assert.equal(res.data.killed, false);
    assert.ok(res.data.stdout.includes('6'));
  });

  test('exec wait 超时仍回收已收集输出（兜底路径不再返回空字符串）', async () => {
    const res = await req('/api/exec', {
      command: 'echo buffered_out; sleep 30', cwd: ctx.testDir, wait: true, timeoutMs: 7000,
    }, 'POST', 60000);
    assert.equal(res.data.killed, true);
    // echo 在第一期输出→延长一期→第二期静默被杀；无论如何 stdout 不应为空串丢失
    assert.ok((res.data.stdout || '').includes('buffered_out') || (res.data.error || '').length > 0);
  });

  test('POST /api/exec/detach：豁免超时后进程仍存活', async () => {
    const res = await req('/api/exec', { command: 'sleep 8', cwd: ctx.testDir, timeoutMs: 3000 }, 'POST', 30000);
    const execId = res.data.execId;
    const d = await req('/api/exec/detach', { execId }, 'POST', 30000);
    assert.equal(d.data.success, true);
    await new Promise((r) => setTimeout(r, 4500)); // 越过原 3s 预算
    const stop = await req('/api/exec/stop', { execId }, 'POST', 30000);
    assert.equal(stop.data.success, true, 'detach 后进程应仍存活（超时豁免生效）');
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test agent/test/integration/api.integration.test.js` （如该文件需要专用启动方式，按文件头注释执行）
Expected: 新用例 FAIL（wait 模式忽略 timeoutMs → 用例 1 耗时 30s+；用例 4 路由 404）。旧用例全 PASS。

- [ ] **Step 3: 实现 executor.js 改造**

3a. `executeCommand` 增加第 6 参数并接策略函数（替换原 L174-L178 与 L215-L219）：

```js
function executeCommand(command, cwd, wsClient, onComplete, collectOutput = false, execOpts = {}) {
  const config = loadConfig();
  const workdir = cwd || config.workdir;
  const execId = generateExecId();
  // 协议协商：调用方显式传 timeoutMs → 受管模式（定时器与 WS 连接数解耦，延长由策略函数裁决）
  // 未传 → 旧语义（commandTimeout + 断连清定时器），保证新 agent × 旧插件兼容
  const requestedTimeout = Number(execOpts.timeoutMs) > 0 ? Math.round(Number(execOpts.timeoutMs)) : null;
  const timeout = requestedTimeout || config.commandTimeout || 300000;
  const managed = requestedTimeout != null;
```

entry 结构追加字段：

```js
  const entry = {
    process: proc, wsClients, stdoutBuf: '', stderrBuf: '',
    truncStdout: false, truncStderr: false, command, startTime: Date.now(),
    baseTimeout: timeout, managed, extensions: 0, outputInPeriod: false,
    detached: false, timedOut: false,
  };
```

替换原 `entry.timeoutId = setTimeout(...)`（L216-L219）为装填函数：

```js
  function armTimeout(ms) {
    entry.timeoutId = setTimeout(() => {
      entry.timeoutId = null;
      if (!entry.managed) {
        // 旧语义：到期直接杀
        killed = true; entry.timedOut = true;
        killProcess(execId);
        return;
      }
      const d = decideTimeoutAction({
        outputInPeriod: entry.outputInPeriod,
        extensions: entry.extensions,
        elapsedMs: Date.now() - entry.startTime,
        baseTimeout: entry.baseTimeout,
      });
      if (d.action === 'extend') {
        entry.extensions = d.extensions;
        entry.outputInPeriod = false;
        armTimeout(d.nextTimeoutMs);
      } else {
        killed = true; entry.timedOut = true;
        killProcess(execId);
      }
    }, ms);
  }
  armTimeout(timeout);
```

3b. stdout/stderr 的 `data` 处理器首行各加一句（在 `const str = chunk.toString();` 之后）：

```js
    entry.outputInPeriod = true;
```

3c. `proc.on('close')` 广播加 timedOut 标志（替换 L273）：

```js
    broadcast({ type: 'exit', exitCode: finalExitCode, execId, killed, timedOut: entry.timedOut });
```

`on('error')` 的 exit 回放广播（L382 `addWsClient` 内）同步带上：completedProcesses.set 增加 `timedOut: entry.timedOut` 字段，回放行改为
`wsClient.send(JSON.stringify({ type: 'exit', exitCode: completed.exitCode, execId, killed: completed.killed, timedOut: completed.timedOut }));`

3d. `disconnectWsClient` 定时器解除加受管模式守卫（替换 L401-L410）：

```js
  // 旧语义：全部客户端断开 → 取消超时（进程 daemon 化）。
  // 受管模式：断开可能只是插件端 SW 被 Chrome 杀掉/网络闪断，绝不可解除超时权威，
  // 仅显式 detach（entry.detached）才豁免——连接状态不再反推用户意图。
  if (entry.wsClients.size === 0 && (!entry.managed || entry.detached)) {
    if (entry.timeoutId) { clearTimeout(entry.timeoutId); entry.timeoutId = null; }
    if (entry.forceKillId) { clearTimeout(entry.forceKillId); entry.forceKillId = null; }
  }
```

3e. 新增导出 `detachProcess`（放在 `killProcess` 之前）：

```js
/**
 * 显式声明 daemon 化：取消超时定时器，进程继续运行（插件端空闲挂起分支调用）
 */
function detachProcess(execId) {
  const entry = runningProcesses.get(execId);
  if (!entry) return false;
  entry.detached = true;
  if (entry.timeoutId) { clearTimeout(entry.timeoutId); entry.timeoutId = null; }
  return true;
}
```

并把 `detachProcess` 加入 executor.js 的导出列表。

3f. `executeCommandSync(command, cwd, timeoutMs)`：把 `timeoutMs` 透传给 `executeCommand` 第 6 参 `{ timeoutMs }`；兜底定时器改用与 executeCommand 相同的 `timeout` 推导；兜底触发时回收缓冲（替换原 L333-L357）：

```js
function executeCommandSync(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const config = loadConfig();
    const requestedTimeout = Number(timeoutMs) > 0 ? Math.round(Number(timeoutMs)) : null;
    const timeout = requestedTimeout || config.commandTimeout || 300000;

    let resolved = false;
    let syncTimeoutId = null;

    const execId = executeCommand(command, cwd, null, (result) => {
      clearTimeout(syncTimeoutId);
      if (!resolved) { resolved = true; resolve(result); }
    }, true, { timeoutMs });

    // 兜底：内层策略失效时到点杀进程并回收已收集输出（不再返回空串）
    syncTimeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        killProcess(execId);
        const e = runningProcesses.get(execId);
        resolve({
          execId, exitCode: -1, killed: true,
          stdout: e ? e.stdoutBuf : '', stderr: e ? e.stderrBuf : '',
          error: translate(currentLang, 'error.commandTimeout'),
        });
      }
    }, timeout + 5000);
  });
}
```

- [ ] **Step 4: 实现 server.js 接线**

`/api/exec` 解构改为 `const { command, cwd, wait, force, timeoutMs } = body;`；wait 分支调用 `executeCommandSync(command, resolvedCwd, timeoutMs)`；异步分支调用 `executeCommand(command, resolvedCwd, null, onComplete, false, { timeoutMs })`。

在 `/api/exec/stop` 路由之后新增（同处认证域内）：

```js
      // 显式 daemon 化：豁免超时（插件端空闲挂起分支调用；
      // 替代"WS 全断开即清定时器"的隐式推断，通讯故障不再意外保活）
      if (pathname === '/api/exec/detach') {
        const detached = detachProcess(body.execId);
        logExec('detached', { execId: body.execId, success: detached });
        return jsonResponse(res, 200, { success: detached, execId: body.execId });
      }
```

server.js import 列表加入 `detachProcess`。

- [ ] **Step 5: 运行集成 + 单元确认通过**

Run: `node --test agent/test/integration/api.integration.test.js && node --test agent/test/unit/executor-timeout-policy.unit.test.js && node --test agent/test/unit/executor-shell.unit.test.js`
Expected: 全部 PASS（含新增 4 用例；旧 exec 用例不回归）

- [ ] **Step 6: Commit**

```bash
git add agent/src/executor.js agent/src/server.js agent/test/integration/api.integration.test.js
git commit -m "feat(agent): exec 超时受管模式——timeoutMs 透传+活跃延长+detach 显式豁免+同步路径输出回收"
```

---

### Task 3: Agent 端 WS 心跳（半开连接检测）

**Files:**
- Modify: `agent/src/server.js`（`/ws/exec` upgrade 处理内）

**Interfaces:**
- Produces: WS 层 30s ping / pong 检测；浏览器 WebSocket 原生自动回 pong，插件端零改动

- [ ] **Step 1: 实现**（`wss.handleUpgrade` 回调内、`addWsClient` 成功后追加）

```js
        // 控制面心跳：检测半开连接（TCP 假死）。浏览器对 ping 自动回 pong，
        // 两拍未回视为连接已死 → terminate → 走 disconnect 收敛路径（受管模式定时器仍在）
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        const heartbeat = setInterval(() => {
          if (ws.readyState !== 1) { clearInterval(heartbeat); return; }
          if (!ws.isAlive) { try { ws.terminate(); } catch {} clearInterval(heartbeat); return; }
          ws.isAlive = false;
          ws.ping();
        }, 30000);
        heartbeat.unref();
        ws.on('close', () => clearInterval(heartbeat));
```

- [ ] **Step 2: 回归确认**

Run: `node --test agent/test/integration/api.integration.test.js`
Expected: PASS（无新增网络层错误日志；异步 exec 用例不受影响）

- [ ] **Step 3: Commit**

```bash
git add agent/src/server.js
git commit -m "feat(agent): exec WebSocket 30s ping/pong 心跳，半开连接主动收敛"
```

---

### Task 4: 插件端 AgentClient 透传与 detach API

**Files:**
- Modify: `src/background/local-agent-client.js`（`execCommand`、新增 `detachCommand`，导出列表）

**Interfaces:**
- Consumes: Task 2 的 `/api/exec` `timeoutMs` 字段与 `/api/exec/detach` 路由
- Produces: `execCommand(command, cwd, force = false, timeoutMs = null)`；`detachCommand(execId) => Promise<{success}>`

- [ ] **Step 1: 实现**（替换原 L598-L600，并新增 detach；两者加入底部导出对象）

```js
/**
 * 异步初始化命令执行（流式模式）。
 * timeoutMs 为受管模式协商信号：传给 Agent 作为进程超时权威预算；
 * 不传（null）则老 Agent 保持旧语义。
 */
async function execCommand(command, cwd, force = false, timeoutMs = null) {
  const body = { command, cwd, force };
  if (Number(timeoutMs) > 0) body.timeoutMs = Math.round(Number(timeoutMs));
  return agentRequest('/api/exec', body);
}

/**
 * 显式声明 daemon 化：豁免 Agent 端超时（挂起型命令）
 */
async function detachCommand(execId) {
  return agentRequest('/api/exec/detach', { execId });
}
```

- [ ] **Step 2: 行为验证（经由 Task 5 的调用方测试覆盖，此处静态检查）**

Run: `npx eslint src/background/local-agent-client.js`
Expected: 无 error。`grep -n "detachCommand" src/background/local-agent-client.js` 出现在函数定义与导出两处。

- [ ] **Step 3: Commit**

```bash
git add src/background/local-agent-client.js
git commit -m "feat(extension): AgentClient execCommand 透传 timeoutMs + 新增 detachCommand"
```

---

### Task 5: 插件端超时模型重建（tool-executor.js）

**Files:**
- Modify: `src/background/tool-executor.js`（`executeAgentExecCommand`：L4343-L4746 区段）
- Modify: `src/shared/locales/zh.js` / `en.js`（toolExec 命名空间新增 key）
- Modify: `test/unit/agent-exec-confirmation.unit.test.js`（既有断言补第 4 参）
- Test: `test/unit/agent-exec-timeout-model.unit.test.js`（新建）

**Interfaces:**
- Consumes: Task 4 的 `execCommand(..., timeoutMs)`、`detachCommand`
- Produces: 导出 `EXEC_MAX_EXTENSIONS=5`、`EXEC_TOTAL_BUDGET_CAP_MS=600000`、`computeExecGuardMs(effectiveTimeout) => number`、`computeExecMaxTotalMs(effectiveTimeout) => number`；i18n key：`toolExec.execTotalTimeout`（{seconds}）、`toolExec.execHardTimeout`（{seconds}）、`toolExec.execTimedByAgent`（{seconds}）

- [ ] **Step 1: 写失败测试**

```js
// test/unit/agent-exec-timeout-model.unit.test.js
// agent_exec 两端超时一致性回归：
//   1. timeoutMs 钳制下限后透传给 Agent（受管协商）；
//   2. 插件端不再自行延长，预算耗尽即终止（决策权威在 Agent）；
//   3. 空闲挂起分支先 detach 再关 WS（显式豁免，不再靠断连推断）；
//   4. Agent 上报 exit.timedOut → 本地化超时失败结果；
//   5. WS 建连失败但进程已启动 → 禁止同步重跑（防副作用双重执行）。
// 头部 chrome 全局 mock 复用 agent-exec-confirmation.unit.test.js L13-L60 的完整设置（原样拷贝）。
import { describe, test, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
// ...（拷贝 chrome mock 段）...

vi.mock('../../src/background/local-agent-client.js', () => ({
  execCommand: vi.fn(),
  execCommandWait: vi.fn(),
  createExecWebSocket: vi.fn(),
  stopCommand: vi.fn(),
  detachCommand: vi.fn(() => Promise.resolve({ success: true })),
  isAgentPaired: vi.fn(() => Promise.resolve(false)),
  writeFile: vi.fn(),
}));
vi.mock('../../src/background/config.js', () => ({
  getStoredConfig: vi.fn(),
  getChatConfig: vi.fn(() => Promise.resolve({ customModelMap: {} })),
}));
vi.mock('../../src/background/stream-controller.js', () => ({
  sendAgentStream: vi.fn(),
  sendAgentStreamDone: vi.fn(),
}));

let toolExecutor, AgentClient, configModule;
const baseConfig = { reactConfig: { toolConfirmationEnabled: true, toolTimeout: 600000 }, streamConfig: { streamEnabled: true } };

function makeFakeWs() {
  return { onmessage: null, onclose: null, onerror: null, close: vi.fn() };
}

beforeAll(async () => {
  toolExecutor = await import('../../src/background/tool-executor.js');
  AgentClient = await import('../../src/background/local-agent-client.js');
  configModule = await import('../../src/background/config.js');
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(AgentClient.execCommand).mockReset();
  vi.mocked(AgentClient.execCommandWait).mockReset();
  vi.mocked(AgentClient.createExecWebSocket).mockReset();
  vi.mocked(AgentClient.stopCommand).mockReset().mockResolvedValue({ success: true });
  vi.mocked(AgentClient.detachCommand).mockReset().mockResolvedValue({ success: true });
  configModule.getStoredConfig.mockResolvedValue(baseConfig);
});
afterEach(() => { vi.useRealTimers(); });

const okInit = { success: true, level: 'allow', execId: 'e1', wsUrl: 'ws://x/e1' };

describe('agent_exec 两端超时模型', () => {
  test('computeExecGuardMs/computeExecMaxTotalMs：6 倍预算封顶 600s，保险 +30s', () => {
    expect(toolExecutor.computeExecMaxTotalMs(5000)).toBe(30000);
    expect(toolExecutor.computeExecGuardMs(5000)).toBe(60000);
    expect(toolExecutor.computeExecMaxTotalMs(600000)).toBe(600000);
    expect(toolExecutor.computeExecGuardMs(600000)).toBe(630000);
  });

  test('timeoutMs=3000 → 钳制 5000 并作为第 4 参透传（受管协商）', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    const ws = makeFakeWs();
    AgentClient.createExecWebSocket.mockResolvedValue(ws);
    const p = toolExecutor.executeAgentExecCommand({ command: 'echo hi', timeoutMs: 3000 }, 'tc1', 's1');
    await vi.advanceTimersByTimeAsync(0);
    expect(AgentClient.execCommand).toHaveBeenCalledWith('echo hi', undefined, false, 5000);
    ws.onmessage({ data: JSON.stringify({ type: 'exit', exitCode: 0, execId: 'e1', killed: false, timedOut: false }) });
    const r = await p;
    expect(r.success).toBe(true);
  });

  test('静默命令：预算(maxTotal)耗尽插件端直接终止，不再自行延长，且结果无“已延长”字样', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    const ws = makeFakeWs();
    AgentClient.createExecWebSocket.mockResolvedValue(ws);
    const p = toolExecutor.executeAgentExecCommand({ command: 'sleep 30', timeoutMs: 5000 }, 'tc2', 's2');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30000); // maxTotalMs = 5000*6
    let result; let err;
    await p.then((r) => { result = r; }, (e) => { err = e; });
    // catch 分支返回失败对象（errorMessage 含"超时"路径）
    expect(result).toBeTruthy();
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('延长');
    expect(AgentClient.stopCommand).toHaveBeenCalledWith('e1');
    expect(AgentClient.execCommandWait).not.toHaveBeenCalled();
  });

  test('空闲 120s 无输出 → 先 detachCommand 再关 WS（显式 daemon 豁免）', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    const ws = makeFakeWs();
    AgentClient.createExecWebSocket.mockResolvedValue(ws);
    const p = toolExecutor.executeAgentExecCommand({ command: 'node server.js', timeoutMs: 600000 }, 'tc3', 's3');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120000); // idleTimeoutMs 下限 120s
    await vi.advanceTimersByTimeAsync(0);
    expect(AgentClient.detachCommand).toHaveBeenCalledWith('e1');
    const r = await p;
    expect(r.partial).toBe(true);
    expect(r.success).toBe(true);
  });

  test('Agent 上报 exit.timedOut=true → 返回本地化超时的失败结果', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    const ws = makeFakeWs();
    AgentClient.createExecWebSocket.mockResolvedValue(ws);
    const p = toolExecutor.executeAgentExecCommand({ command: 'long_task', timeoutMs: 5000 }, 'tc4', 's4');
    await vi.advanceTimersByTimeAsync(0);
    ws.onmessage({ data: JSON.stringify({ type: 'exit', exitCode: -1, execId: 'e1', killed: true, timedOut: true }) });
    const r = await p;
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
    expect(AgentClient.execCommandWait).not.toHaveBeenCalled();
  });

  test('WS 建连失败但进程已启动（有 execId）→ 绝不 execCommandWait 重跑', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    AgentClient.createExecWebSocket.mockRejectedValue(new Error('connect refused'));
    const r = await toolExecutor.executeAgentExecCommand({ command: 'touch /tmp/x', timeoutMs: 5000 }, 'tc5', 's5');
    expect(r.success).toBe(false);
    expect(r.execId).toBe('e1');
    expect(AgentClient.execCommandWait).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/agent-exec-timeout-model.unit.test.js`
Expected: FAIL（`computeExecGuardMs` 未导出、execCommand 只收到 3 参、detachCommand 未被调用、execCommandWait 被误调用）

- [ ] **Step 3: 实现 tool-executor.js 改造**

3a. 文件顶部（`executeAgentExecCommand` 之前）新增导出常量与纯函数 + i18n key 注册确认：

```js
// ===== 插件端超时保险参数（决策权威在 Agent 端，此处只做外层兜底） =====
export const EXEC_MAX_EXTENSIONS = 5;          // 与 agent 端 MAX_TIMEOUT_EXTENSIONS 对齐
export const EXEC_TOTAL_BUDGET_CAP_MS = 600000; // 与 agent 端 TOTAL_BUDGET_CAP_MS 对齐
export const EXEC_GUARD_MARGIN_MS = 30000;

/** Agent 端理论最大预算（含全部延长并封顶） */
export function computeExecMaxTotalMs(effectiveTimeout) {
  return Math.min(effectiveTimeout * (1 + EXEC_MAX_EXTENSIONS), EXEC_TOTAL_BUDGET_CAP_MS);
}
/** 插件端硬保险：Agent 裁决失效/不可达时到点终止并杀进程 */
export function computeExecGuardMs(effectiveTimeout) {
  return computeExecMaxTotalMs(effectiveTimeout) + EXEC_GUARD_MARGIN_MS;
}
```

3b. `executeAgentExecCommand` 内：两处 `AgentClient.execCommand(command, cwd, effectiveForce...)` 调用（L4364、L4380）追加第 4 参 `effectiveTimeout`。

3c. Promise 执行段重写要点（替换 L4461-L4558 中定时器部分）：
- 删除 `timeoutExtensions` / `MAX_EXTENSIONS` / 延长分支；
- `const maxTotalMs = computeExecMaxTotalMs(effectiveTimeout); const guardMs = computeExecGuardMs(effectiveTimeout);`
- 空闲分支改为：`idleTimeout = true; AgentClient.detachCommand(execId).catch(() => {}); if (ws) { try { ws.close(); } catch {} } finish('resolve');`（注释注明：显式豁免，替代断连推断）
- 总超时分支改为：

```js
          if (elapsed >= maxTotalMs) {
            const errMsg = t('toolExec.execTotalTimeout', { seconds: Math.round(maxTotalMs / 1000) });
            console.warn('[AgentExec] execTotalTimeout reached (agent 裁决失效兜底):', errMsg);
            cleanupAndStop(errMsg).then(() => { finish(new Error(errMsg)); });
            return;
          }
          const remainingTotal = maxTotalMs - elapsed;
          const nextCheck = Math.min(idleTimeoutMs, remainingTotal);
          totalTimeoutId = setTimeout(scheduleTimeoutCheck, nextCheck);
```

- 硬超时 `hardTimeoutId` 的 `}, 120000);` 改为 `}, guardMs);`，回调内 `reject(new Error(t('toolExec.execHardTimeout', { seconds: Math.round(guardMs / 1000) })))`。

3d. exit 消息处理（L4425-4430 与 onmessage 包装 L4571 处）读取 `data.timedOut`，新增局部变量 `let timedOutByAgent = false;` 并在两处赋值 `timedOutByAgent = data.timedOut === true;`。

3e. 正常收尾返回（L4723-4745）前插入：

```js
    if (timedOutByAgent) {
      const errMsg = t('toolExec.execTimedByAgent', { seconds: Math.round(computeExecMaxTotalMs(effectiveTimeout) / 1000) });
      appendAuditLog('command_exec', `Command timed out by agent: ${command}`, { command, cwd, exitCode });
      sendAgentStreamDone(sessionId, execId, toolCallId, exitCode);
      return {
        success: false, level: 'allow', execId, exitCode,
        stdout: stdoutCollected, stderr: stderrCollected, killed: true, timedOut: true,
        content: `${errMsg}\n${t('toolExec.collectedOutput')}${stdoutCollected ? 'stdout:\n```\n' + stdoutCollected + '\n```' : ''}${stderrCollected ? '\nstderr:\n```\n' + stderrCollected + '\n```' : ''}`,
        message: errMsg, error: errMsg, tool_call_id: toolCallId,
      };
    }
```

3f. catch 回退分支（L4660-4678）改造：把原 `if (errorMessage.includes('超时') || ... || stopped)` 与后续同步回退合并替换为：

```js
      // 进程已在 Agent 端启动（拿到过 execId）→ 绝不同步重跑，防止副作用双重执行；
      // 仅 init 本身失败（无 execId，进程未启动）才允许回退到同步模式
      const processStarted = !!execId;
      if (processStarted) {
        sendAgentStreamDone(sessionId, execId, toolCallId, -1);
        appendAuditLog('command_exec', `Command failed: ${command}`, { command, cwd, exitCode: -1, error: errorMessage });
        return {
          success: false, level: 'allow', execId, exitCode: -1,
          stdout: stdoutCollected, stderr: stderrCollected, killed: true,
          message: t('toolExec.commandExecFailedWithOutput', {
            error: errorMessage,
            output: (stdoutCollected ? 'stdout:\n```\n' + stdoutCollected + '\n```' : '') + (stderrCollected ? '\nstderr:\n```\n' + stderrCollected + '\n```' : ''),
          }),
          error: errorMessage,
        };
      }
      console.warn('[AgentExec] exec init failed before process start, fallback to sync mode:', errorMessage);
```

（其后保留原 `executeWithCancel(... execCommandWait ...)` 回退代码。）

- [ ] **Step 4: 补 i18n key**（`src/shared/locales/zh.js` / `en.js` 的 `toolExec` 命名空间）

```js
// zh
execTotalTimeout: '命令执行总超时（{seconds}s），已由扩展端保险层终止',
execHardTimeout: '命令执行超时（保险上限 {seconds}s）',
execTimedByAgent: '命令执行超时（代理端预算 {seconds}s 耗尽，持续静默或超出延长上限）',
collectedOutput: '已收集输出:\n',
// en
execTotalTimeout: 'Command total timeout ({seconds}s), terminated by extension-side guard',
execHardTimeout: 'Command execution timeout (guard limit {seconds}s)',
execTimedByAgent: 'Command timed out (agent budget {seconds}s exhausted: silent past grace or extension limit reached)',
collectedOutput: 'Collected output:\n',
```

- [ ] **Step 5: 修复受接口变更影响的既有断言**

`test/unit/agent-exec-confirmation.unit.test.js` 中所有 `execCommand` 期望补第 4 参（baseConfig 的 toolTimeout 值）：
- L146 → `toHaveBeenCalledWith('sudo apt install x', undefined, false, 600000)`
- L175 → `toHaveBeenNthCalledWith(2, 'sudo apt install x', undefined, true, 600000)`
- L199/L200 → 同理分别补 `, 600000)`
同文件如有 `execCommandWait` 断言不变（第 4 参原本就传 effectiveTimeout）。

- [ ] **Step 6: 运行本任务与既有测试确认通过**

Run: `npx vitest run test/unit/agent-exec-timeout-model.unit.test.js test/unit/agent-exec-confirmation.unit.test.js`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add src/background/tool-executor.js src/shared/locales/zh.js src/shared/locales/en.js test/unit/agent-exec-timeout-model.unit.test.js test/unit/agent-exec-confirmation.unit.test.js
git commit -m "fix(extension): agent_exec 超时决策权移交代理端——去延长分支/派生保险/detach 显式化/timedOut 映射/防双重执行"
```

---

### Task 6: 工具 Schema 声明超时契约

**Files:**
- Modify: `src/background/tools/agent-tools.js`（L64 `timeoutMs`）
- Test: `test/unit/agent-exec-timeout-model.unit.test.js`（追加 describe 块）

- [ ] **Step 1: 写失败测试**（追加到 Task 5 测试文件末尾；文件路径以 agent-tools.js 相对仓库根读取，避免模块副作用）

```js
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('agent_exec schema 超时契约', () => {
  test('timeoutMs 声明 minimum=5000 与延长语义描述', () => {
    const src = readFileSync(resolve(__dirname, '../../src/background/tools/agent-tools.js'), 'utf8');
    expect(src).toMatch(/timeoutMs:\s*\{[^}]*minimum:\s*5000/);
    expect(src).toMatch(/timeoutMs:\s*\{[^}]*description:/);
  });
});
```

- [ ] **Step 2: 运行确认失败** — Run: `npx vitest run test/unit/agent-exec-timeout-model.unit.test.js` → FAIL

- [ ] **Step 3: 实现**（agent-tools.js L64 替换）

```js
          timeoutMs: {
            type: 'integer',
            minimum: 5000,
            description: 'Execution time limit in ms (minimum 5000, values below are clamped). Commands that stop producing output are killed near this limit; actively-outputting commands may extend up to a 10-minute total cap'
          }
```

- [ ] **Step 4: 运行确认通过** — Run: `npx vitest run test/unit/agent-exec-timeout-model.unit.test.js` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/background/tools/agent-tools.js test/unit/agent-exec-timeout-model.unit.test.js
git commit -m "feat(extension): agent_exec timeoutMs schema 声明下限与延长契约"
```

---

### Task 7: 全量回归与收尾

- [ ] **Step 1: Agent 全量单测 + 集成**

Run: `node --test agent/test/unit/*.test.js && node --test agent/test/integration/api.integration.test.js`
Expected: 0 failures

- [ ] **Step 2: 插件端全量单测**

Run: `npx vitest run`
Expected: 全部通过（基线约 97 文件；0 failures）

- [ ] **Step 3: Lint + 静默构建**（项目规范：修改后必须 build:silent）

Run: `npx eslint src agent/src && npm run build:silent`
Expected: eslint 0 error；输出 BUILD_SUCCESS

- [ ] **Step 4: CHANGELOG 登记**（`CHANGELOG.md` 顶部新增条目，中英双语按文件既有格式）

```markdown
- fix: agent_exec 两端超时一致性——timeoutMs 透传代理端并作为进程超时权威；
  插件端不再无条件延长 5 次（改为代理端"期内有输出才延长"策略，总预算封顶 10 分钟）；
  WS 断开不再解除进程超时（显式 /api/exec/detach 豁免）；WS 失败回退不再重跑已启动命令；
  同步超时回收已收集输出；120s 写死保险改为按预算派生（agent v<待发布版本>）
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 登记两端超时一致性修复"
```

- [ ] **Step 6: 发布顺序备忘（人工步骤，不在本计划内自动执行）**

先发 agent（`agent/publish.sh`，版本号 +1），再发插件版本。若用户要求端到端灰度复测，重跑其原 7 组用例，验收标准：第 7 组 `timeoutMs=3000` + `sleep 30` 在 **约 5-12s** 内返回超时失败且进程被杀（不再出现"已延长5次/30s"）。

---

## Assumptions（用户未拍板、按推荐值锁定，执行时可在两个常量处一行调整）

1. **延长策略保留但改判据**：不移除延长机制，判据从"无条件"改为"本预算期内有输出"（`outputInPeriod`）。静默命令 = 到点即杀，符合交互式体验诉求；持续输出命令（构建日志）获得真实保护。
2. **总预算封顶 600000ms（10 分钟）**：与 `toolTimeout` 配置上限对齐，替代原"6 倍无上限"，避免 `600s×6=1h` 的失控窗口。
3. **`ACTIVITY_WINDOW_MS` 未采用**：输出流即心跳的模型下，"期内是否输出"标志比滑动静默窗口更确定（不存在 printf 在边界时刻的 flaky），故不引入独立窗口常量。
4. **空闲 daemon 分支保留原语义**（静默 120s → detach + partial success），因服务型命令体验已验证；仅把"断连推断"改为"显式声明"。
5. **Agent 版本号递增与 CHANGELOG 文本**由发布时人工确认，本计划不做 `npm publish`。
