import { describe, it, expect, vi } from 'vitest';
import { createRoutingEvidenceCollector } from '../../src/background/completion-verifier.js';

function makeSend(result) {
  const fn = vi.fn(async () => result);
  return fn;
}
function makeExec(result) {
  const fn = vi.fn(async () => result);
  return fn;
}

describe('createRoutingEvidenceCollector - 按 check 类型路由', () => {
  it('DOM 类（element_exists）→ 走内容取证器，不碰 execWait', async () => {
    const send = makeSend([{ available: true, pass: true }]);
    const exec = makeExec({ exitCode: 0 });
    const c = createRoutingEvidenceCollector({ tabId: 42, sendMessage: send, execWait: exec });
    const r = await c({ check: 'element_exists', target: '#a' });
    expect(r).toEqual({ available: true, pass: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(42);
    expect(send.mock.calls[0][1].type).toBe('EVALUATE_DONE_CRITERIA');
    expect(exec).not.toHaveBeenCalled();
  });

  it('命令类（file_exists）→ 走命令取证器，不碰 sendMessage', async () => {
    const send = makeSend([{ available: true, pass: true }]);
    const exec = makeExec({ exitCode: 0 });
    const c = createRoutingEvidenceCollector({ tabId: 42, sendMessage: send, execWait: exec });
    const r = await c({ check: 'file_exists', target: '/tmp/a' });
    expect(r).toEqual({ available: true, pass: true });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][0]).toBe("test -e '/tmp/a'");
    expect(send).not.toHaveBeenCalled();
  });

  it('未知 check → 不派发，归 unknown_check 取不到证', async () => {
    const send = makeSend([{ available: true, pass: true }]);
    const exec = makeExec({ exitCode: 0 });
    const c = createRoutingEvidenceCollector({ tabId: 42, sendMessage: send, execWait: exec });
    const r = await c({ check: 'totally_unknown' });
    expect(r).toEqual({ available: false, pass: false, reason: 'unknown_check' });
    expect(send).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('text_contains 属 DOM 类，url_matches 属 DOM 类', async () => {
    const send = makeSend([{ available: true, pass: false }]);
    const exec = makeExec({ exitCode: 0 });
    const c = createRoutingEvidenceCollector({ tabId: 1, sendMessage: send, execWait: exec });
    await c({ check: 'text_contains', expected: 'x' });
    await c({ check: 'url_matches', target: 'example' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(exec).not.toHaveBeenCalled();
  });

  it('command_output_matches / command_exit_zero 属命令类', async () => {
    const send = makeSend([{ available: true, pass: true }]);
    const exec = makeExec({ exitCode: 0, stdout: 'OK' });
    const c = createRoutingEvidenceCollector({ tabId: 1, sendMessage: send, execWait: exec });
    await c({ check: 'command_exit_zero', target: 'ls' });
    await c({ check: 'command_output_matches', target: 'ls', expected: 'OK' });
    expect(exec).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
  });
});
