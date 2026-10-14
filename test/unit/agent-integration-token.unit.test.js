// test/unit/agent-integration-token.unit.test.js
// agent 集成测试的凭据纪律：仓库里不得出现真实配对 token；缺 token 时必须快速失败，而不是带着兜底值去连服务
// 背景：agent/test/integration/api.integration.test.js 曾把某台机器的 64 位配对 token 硬编码为
//   `process.env.AGENT_TOKEN || '<真实token>'` 的兜底值并提交进 git。一旦仓库推送，凭据即进入公开历史，
//   而该 token 是本地 agent 管理接口的唯一鉴权凭据（持有者可读写用户工作区、改配置、导知识库）。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { spawnSync } from 'child_process';

const INTEGRATION_DIR = join(process.cwd(), 'agent', 'test', 'integration');
const API_TEST_FILE = join(INTEGRATION_DIR, 'api.integration.test.js');

// 从本机配对记录里取真实 token；文件不存在（如 CI）时返回空数组，相关断言自动跳过
function localTokens() {
  try {
    const raw = readFileSync(join(homedir(), '.ai-helper-agent', 'pairings.json'), 'utf-8');
    return [...new Set(raw.match(/[0-9a-f]{64}/g) || [])];
  } catch {
    return [];
  }
}

function integrationSources() {
  return readdirSync(INTEGRATION_DIR)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, text: readFileSync(join(INTEGRATION_DIR, name), 'utf-8') }));
}

describe('agent 集成测试 - 凭据不得入库', () => {
  it('集成测试目录里不存在任何 64 位十六进制字面量', () => {
    const offenders = integrationSources()
      .filter(({ text }) => /["'`][0-9a-f]{64}["'`]/.test(text))
      .map(({ name }) => name);
    expect(offenders, `以下文件硬编码了疑似凭据的长十六进制串: ${offenders.join(', ')}`).toEqual([]);
  });

  it('集成测试源码中不出现本机真实配对 token', () => {
    const tokens = localTokens();
    if (tokens.length === 0) return; // 无配对记录的环境（CI）不适用
    const hits = integrationSources()
      .filter(({ text }) => tokens.some((token) => text.includes(token)))
      .map(({ name }) => name);
    expect(hits, `以下文件出现了真实配对 token: ${hits.join(', ')}`).toEqual([]);
  });
});

describe('agent 集成测试 - 缺 token 时快速失败', () => {
  it('未设 AGENT_TOKEN 且无配对记录时，不启动任何请求即报错退出', () => {
    // 用一个空的 HOME 隔离掉本机 pairings.json，模拟"凭据不可得"
    const fakeHome = mkdtempSync(join(tmpdir(), 'aha-no-pairing-'));
    const result = spawnSync(process.execPath, ['--test', API_TEST_FILE], {
      cwd: process.cwd(),
      timeout: 30000,
      encoding: 'utf-8',
      env: { PATH: process.env.PATH, HOME: fakeHome, AGENT_URL: 'http://127.0.0.1:1' },
    });

    expect(result.status, `应非零退出，stderr: ${result.stderr}`).not.toBe(0);
    const output = `${result.stderr}${result.stdout}`;
    expect(output).toMatch(/token/i);
    // 关键判据：必须在发起任何请求之前就退出。若出现连接失败字样，
    // 说明它带着某个兜底 token 真的去连了服务（凭据泄漏的老行为）。
    expect(output).not.toMatch(/ECONNREFUSED|fetch failed|connect ECONN/i);
  });
});
