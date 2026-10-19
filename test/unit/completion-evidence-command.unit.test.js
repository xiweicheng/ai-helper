import { describe, it, expect, vi } from 'vitest';
import { createCommandEvidenceCollector, buildVerifyCommand } from '../../src/background/completion-verifier.js';

// 假 execWait：返回给定结果并记录调用参数（用于负向断言"被拒命令根本不执行"）。
function makeExec(result) {
  const calls = [];
  const fn = vi.fn(async (command, cwd, force, timeoutMs) => {
    calls.push({ command, cwd, force, timeoutMs });
    if (result instanceof Error) throw result;
    return result;
  });
  fn.calls = calls;
  return fn;
}

describe('buildVerifyCommand - 命令编译与构建期拒绝', () => {
  it('命令类：取 target 为命令', () => {
    expect(buildVerifyCommand({ check: 'command_exit_zero', target: 'ls /tmp' })).toEqual({ command: 'ls /tmp' });
  });
  it('文件类：走只读模板 + 单引号转义', () => {
    expect(buildVerifyCommand({ check: 'file_exists', target: '/tmp/a' })).toEqual({ command: "test -e '/tmp/a'" });
    expect(buildVerifyCommand({ check: 'file_absent', target: '/tmp/a' })).toEqual({ command: "test ! -e '/tmp/a'" });
    expect(buildVerifyCommand({ check: 'file_contains', target: '/tmp/a', expected: 'needle' })).toEqual({ command: "grep -qF -- 'needle' '/tmp/a'" });
  });
  it('空 target / 缺 expected / 控制字符路径 → 构建期 reason', () => {
    expect(buildVerifyCommand({ check: 'command_exit_zero', target: '' })).toEqual({ reason: 'empty_target' });
    expect(buildVerifyCommand({ check: 'command_output_matches', target: 'ls', expected: '' })).toEqual({ reason: 'missing_expected' });
    expect(buildVerifyCommand({ check: 'file_contains', target: '/tmp/a' })).toEqual({ reason: 'missing_expected' });
    expect(buildVerifyCommand({ check: 'file_exists', target: '/tmp/\na' })).toEqual({ reason: 'bad_path' });
    expect(buildVerifyCommand({ check: 'weird' })).toEqual({ reason: 'unknown_check' });
  });
});

describe('createCommandEvidenceCollector - 退出码/输出语义', () => {
  it('command_exit_zero：exit 0 → pass true', async () => {
    const exec = makeExec({ exitCode: 0, stdout: '', stderr: '' });
    const c = createCommandEvidenceCollector({ execWait: exec });
    await expect(c({ check: 'command_exit_zero', target: 'ls /tmp' })).resolves.toEqual({ available: true, pass: true });
    expect(exec.calls[0].force).toBe(false); // 红线：永不 force
  });
  it('command_exit_zero：exit 1 → available true + pass false（真实未达成，非取不到证）', async () => {
    const exec = makeExec({ exitCode: 1 });
    const c = createCommandEvidenceCollector({ execWait: exec });
    await expect(c({ check: 'command_exit_zero', target: 'ls /nope' })).resolves.toEqual({ available: true, pass: false });
  });
  it('file_exists：test -e 退出码映射', async () => {
    const exec = makeExec({ exitCode: 0 });
    const c = createCommandEvidenceCollector({ execWait: exec });
    const r = await c({ check: 'file_exists', target: '/tmp/a' });
    expect(r).toEqual({ available: true, pass: true });
    expect(exec.calls[0].command).toBe("test -e '/tmp/a'");
  });
  it('command_output_matches：stdout 含 expected → pass true；不含 → false', async () => {
    const hit = createCommandEvidenceCollector({ execWait: makeExec({ exitCode: 0, stdout: 'ALL TESTS OK' }) });
    await expect(hit({ check: 'command_output_matches', target: 'ls', expected: 'OK' })).resolves.toEqual({ available: true, pass: true });
    const miss = createCommandEvidenceCollector({ execWait: makeExec({ exitCode: 0, stdout: 'nothing' }) });
    await expect(miss({ check: 'command_output_matches', target: 'ls', expected: 'OK' })).resolves.toMatchObject({ available: true, pass: false });
  });
});

describe('createCommandEvidenceCollector - 只读安全门（负向：被拒不执行）', () => {
  it('非只读命令（pytest）→ verify_command_not_readonly 且 execWait 未被调用', async () => {
    const exec = makeExec({ exitCode: 0 });
    const c = createCommandEvidenceCollector({ execWait: exec });
    const r = await c({ check: 'command_exit_zero', target: 'pytest' });
    expect(r).toEqual({ available: false, pass: false, reason: 'verify_command_not_readonly' });
    expect(exec).not.toHaveBeenCalled();
  });
  it('注入型路径（含分号）→ bad_path 且不执行', async () => {
    const exec = makeExec({ exitCode: 0 });
    const c = createCommandEvidenceCollector({ execWait: exec });
    // 路径含分号：shQuoteArg 会中和为字面量，模板命令 test -e '<path>' 仍是只读，
    // 但控制字符换行才判 bad_path；这里用换行验证不执行。
    const r = await c({ check: 'file_exists', target: '/tmp/\nrmdir' });
    expect(r).toMatchObject({ available: false, reason: 'bad_path' });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('createCommandEvidenceCollector - 通道/离线/超时归 indeterminate', () => {
  it('execWait 缺失 → agent_unavailable', async () => {
    const c = createCommandEvidenceCollector({});
    await expect(c({ check: 'command_exit_zero', target: 'ls' })).resolves.toMatchObject({ available: false, reason: 'agent_unavailable' });
  });
  it('isOnline=false → agent_unavailable 且不执行', async () => {
    const exec = makeExec({ exitCode: 0 });
    const c = createCommandEvidenceCollector({ execWait: exec, isOnline: () => false });
    await expect(c({ check: 'command_exit_zero', target: 'ls' })).resolves.toMatchObject({ available: false, reason: 'agent_unavailable' });
    expect(exec).not.toHaveBeenCalled();
  });
  it('killed → command_timeout', async () => {
    const c = createCommandEvidenceCollector({ execWait: makeExec({ killed: true, exitCode: 124 }) });
    await expect(c({ check: 'command_exit_zero', target: 'ls' })).resolves.toMatchObject({ available: false, reason: 'command_timeout' });
  });
  it('error: not paired → agent_unavailable', async () => {
    const c = createCommandEvidenceCollector({ execWait: makeExec({ error: 'agent not paired' }) });
    await expect(c({ check: 'command_exit_zero', target: 'ls' })).resolves.toMatchObject({ available: false, reason: 'agent_unavailable' });
  });
  it('execWait 抛错 → command_error', async () => {
    const c = createCommandEvidenceCollector({ execWait: makeExec(new Error('boom')) });
    await expect(c({ check: 'command_exit_zero', target: 'ls' })).resolves.toMatchObject({ available: false, reason: 'command_error' });
  });
});

// B2：rerunEnabled=true（readOnlyGate=false）时去本地只读硬拦，委派 agent 三档门控。
// allow→执行读退出码；confirm/deny→agent 不执行→indeterminate；force 仍恒 false。
describe('createCommandEvidenceCollector - agent 三档门控（readOnlyGate=false）', () => {
  it('非只读 allow 命令（pytest）：本地不拦、发 agent、exit0→pass', async () => {
    const exec = makeExec({ success: true, level: 'allow', exitCode: 0, stdout: '', stderr: '' });
    const c = createCommandEvidenceCollector({ execWait: exec, readOnlyGate: false });
    const r = await c({ check: 'command_exit_zero', target: 'pytest' });
    expect(r).toEqual({ available: true, pass: true });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][0]).toBe('pytest');
    expect(exec.mock.calls[0][2]).toBe(false); // 红线：永不 force
  });
  it('allow 但 exit≠0 → available true + pass false（真实未达成）', async () => {
    const exec = makeExec({ success: true, level: 'allow', exitCode: 1 });
    const c = createCommandEvidenceCollector({ execWait: exec, readOnlyGate: false });
    await expect(c({ check: 'command_exit_zero', target: 'pytest' })).resolves.toEqual({ available: true, pass: false });
  });
  it('agent 返 level:confirm（未执行）→ verify_command_confirm_required、indeterminate', async () => {
    const exec = makeExec({ success: true, level: 'confirm', reason: '需要确认' });
    const c = createCommandEvidenceCollector({ execWait: exec, readOnlyGate: false });
    await expect(c({ check: 'command_exit_zero', target: 'rm -rf ./dist' })).resolves.toMatchObject({ available: false, reason: 'verify_command_confirm_required' });
  });
  it('agent 返 403 level:deny（未执行）→ verify_command_denied、indeterminate', async () => {
    const exec = makeExec({ success: false, level: 'deny', httpStatus: 403, error: '黑名单' });
    const c = createCommandEvidenceCollector({ execWait: exec, readOnlyGate: false });
    await expect(c({ check: 'command_exit_zero', target: 'rm -rf /' })).resolves.toMatchObject({ available: false, reason: 'verify_command_denied' });
  });
  it('文件类走只读模板：agent allow exit0 → pass（不受只读门影响）', async () => {
    const exec = makeExec({ success: true, level: 'allow', exitCode: 0 });
    const c = createCommandEvidenceCollector({ execWait: exec, readOnlyGate: false });
    const r = await c({ check: 'file_exists', target: '/tmp/a' });
    expect(r).toEqual({ available: true, pass: true });
    expect(exec.mock.calls[0][0]).toBe("test -e '/tmp/a'");
  });
  it('默认（只读门开）：非只读命令仍被本地拦、不发 agent', async () => {
    const exec = makeExec({ success: true, level: 'allow', exitCode: 0 });
    const c = createCommandEvidenceCollector({ execWait: exec }); // readOnlyGate 默认 true
    await expect(c({ check: 'command_exit_zero', target: 'pytest' })).resolves.toMatchObject({ available: false, reason: 'verify_command_not_readonly' });
    expect(exec).not.toHaveBeenCalled();
  });
});
