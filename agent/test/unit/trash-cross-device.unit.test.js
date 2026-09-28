// agent/test/unit/trash-cross-device.unit.test.js
// 跨设备移动回退单元测试：rename 优先，EXDEV → 复制 + 删除源（Windows 跨盘 / 外接卷）
// 运行：node --test agent/test/unit/trash-cross-device.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { movePathCrossDevice } from '../../src/trash.js';

function makeOps(overrides = {}) {
  const calls = [];
  const exdev = () => Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' });
  const ops = {
    rename: async () => { calls.push(['rename']); },
    cp: async (...args) => { calls.push(['cp', ...args]); },
    rm: async (...args) => { calls.push(['rm', ...args]); },
  };
  return { ops: Object.assign(ops, overrides), calls, exdev };
}

describe('movePathCrossDevice', () => {
  test('同设备：rename 成功，不再调用 cp/rm', async () => {
    const { ops, calls } = makeOps();
    await movePathCrossDevice('/src/a.txt', '/trash/a.txt', ops);
    assert.deepEqual(calls, [['rename']]);
  });

  test('EXDEV：先 rename 失败，再 cp(recursive) + rm(源, recursive/force)', async () => {
    const { ops, calls, exdev } = makeOps({
      rename: async () => { calls.push(['rename']); throw exdev(); },
    });
    await movePathCrossDevice('/mnt/usb/a.txt', '/trash/a.txt', ops);
    assert.deepEqual(calls, [
      ['rename'],
      ['cp', '/mnt/usb/a.txt', '/trash/a.txt', { recursive: true }],
      ['rm', '/mnt/usb/a.txt', { recursive: true, force: true }],
    ]);
  });

  test('非 EXDEV 错误：直接抛出，不进入复制回退', async () => {
    const eperm = Object.assign(new Error('permission denied'), { code: 'EPERM' });
    const { ops, calls } = makeOps({
      rename: async () => { calls.push(['rename']); throw eperm; },
    });
    await assert.rejects(
      () => movePathCrossDevice('/src/a.txt', '/trash/a.txt', ops),
      (err) => err.code === 'EPERM'
    );
    assert.deepEqual(calls, [['rename']]);
  });

  test('EXDEV 且复制失败：清理半成品目标后抛出原错误', async () => {
    const { ops, calls, exdev } = makeOps({
      rename: async () => { calls.push(['rename']); throw exdev(); },
      cp: async () => { throw new Error('disk full'); },
    });
    await assert.rejects(
      () => movePathCrossDevice('/src/a.txt', '/trash/a.txt', ops),
      /disk full/
    );
    assert.deepEqual(calls, [
      ['rename'],
      ['rm', '/trash/a.txt', { recursive: true, force: true }], // 清理半成品目标
    ]);
  });

  test('无 code 字段的错误按非 EXDEV 处理（向上抛出）', async () => {
    const { ops } = makeOps({ rename: async () => { throw new Error('boom'); } });
    await assert.rejects(() => movePathCrossDevice('/src/a.txt', '/trash/a.txt', ops), /boom/);
  });
});
