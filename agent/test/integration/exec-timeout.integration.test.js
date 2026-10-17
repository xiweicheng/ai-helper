// agent/test/integration/exec-timeout.integration.test.js
// exec 两端超时一致性集成测试：需要一个正在运行的 Agent（改完源码须重启 agent）
// 运行：node --test agent/test/integration/exec-timeout.integration.test.js
// 环境变量：AGENT_TOKEN（缺省回读 ~/.ai-helper-agent/pairings.json）、AGENT_URL（默认 http://127.0.0.1:18910）
// 用例均不传 cwd（落到默认 workdir）、不产生文件副作用，无需清理。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';
import WebSocket from 'ws';
import { decodeSecret } from '../../src/crypto-lite.js';

function resolveToken() {
  const fromEnv = process.env.AGENT_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    const pairings = JSON.parse(readFileSync(join(homedir(), '.ai-helper-agent', 'pairings.json'), 'utf-8'));
    const paired = Object.values(pairings).find((item) => item && typeof item.token === 'string' && item.token);
    // 磁盘存的是 enc: 混淆密文，agent 加载时解码；鉴权头必须用明文 token
    if (paired) return decodeSecret(paired.token);
  } catch { /* 落到统一报错 */ }
  console.error('缺少认证 token：请设置 AGENT_TOKEN，或确保 ~/.ai-helper-agent/pairings.json 中存在有效配对记录');
  process.exit(1);
}

const TOKEN = resolveToken();
const BASE = process.env.AGENT_URL || 'http://127.0.0.1:18910';

async function req(path, body, method = 'POST', timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify(body || {})
    }, { signal: controller.signal });
    clearTimeout(timer);
    return { status: res.status, data: await res.json().catch(() => ({})) };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, error: err.message };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('exec 超时一致性', () => {
  test('wait 模式：timeoutMs 透传，静默命令按期被杀（不再跑满 300s 配置默认）', async () => {
    const start = Date.now();
    const res = await req('/api/exec', { command: 'sleep 30', wait: true, timeoutMs: 6000 });
    const elapsed = Date.now() - start;
    assert.equal(res.data.success, true);
    assert.equal(res.data.killed, true);
    assert.ok(elapsed < 15000, `应在预算附近终止，实际 ${elapsed}ms`);
  });

  test('wait 模式：持续有输出触发自动延长，命令完整跑完', async () => {
    const res = await req('/api/exec', {
      command: 'for i in 1 2 3 4 5 6; do echo $i; sleep 0.7; done', wait: true, timeoutMs: 3000,
    });
    assert.equal(res.data.exitCode, 0);
    assert.equal(res.data.killed, false);
    assert.ok(res.data.stdout.includes('6'));
  });

  test('wait 模式超时仍回收已收集输出（兜底路径不再返回空字符串）', async () => {
    const res = await req('/api/exec', { command: 'echo buffered_out; sleep 30', wait: true, timeoutMs: 7000 });
    assert.equal(res.data.killed, true);
    // echo 在第一期输出 → 延长一期 → 第二期静默被杀；输出不得丢失
    assert.ok((res.data.stdout || '').includes('buffered_out'), `stdout 应保留缓冲，实际: ${JSON.stringify(res.data.stdout)}`);
  });

  test('POST /api/exec/detach：豁免超时后进程仍存活', async () => {
    const res = await req('/api/exec', { command: 'sleep 8', timeoutMs: 3000 });
    const execId = res.data.execId;
    assert.ok(execId, '异步模式应返回 execId');
    const d = await req('/api/exec/detach', { execId });
    assert.equal(d.data.success, true);
    await sleep(4500); // 越过原 3s 预算
    const stop = await req('/api/exec/stop', { execId });
    assert.equal(stop.data.success, true, 'detach 后进程应仍存活（超时豁免生效）');
  });

  test('受管模式：WS 客户端全部断开不解除超时（意外断连不再等价于永久保活）', async () => {
    const res = await req('/api/exec', { command: 'sleep 30', timeoutMs: 4000 });
    const execId = res.data.execId;
    assert.ok(execId);
    const wsBase = BASE.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/ws/exec/${execId}?token=${encodeURIComponent(TOKEN)}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('ws open timeout')), 5000);
    });
    ws.close(); // 模拟插件端 SW 被杀：连接整体消失
    await sleep(7000); // 越过 4s 预算
    const stop = await req('/api/exec/stop', { execId });
    // 定时器未被断开解除 → 进程已按期被杀 → stop 找不到运行中进程
    assert.equal(stop.data.success, false, '断开不应解除超时，进程应已按期终止');
  });
});
