// agent/test/unit/native-lib-guard.unit.test.js
// node_modules 原生库去重：真实磁盘上的「顶层一份 + transformers 嵌套一份」结构，
// 断言只保留最浅的一份（= overrides 钉的版本），嵌套副本被删除；
// 同时锁住「只管 onnxruntime-node」——onnxruntime-web 自带的 dev 版 common 是正常嵌套，动了就是新风险。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  listNativeCopies,
  pruneNativeDuplicates,
  summarizePruneReport,
} from '../../src/native-lib-guard.js';

const root = mkdtempSync(join(tmpdir(), 'aha-native-guard-'));

/**
 * 造一个「包目录」：写 package.json（版本用于报告）
 * @param {string} dir
 * @param {string} version
 */
function writePackage(dir, version) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version }), 'utf-8');
}

before(() => {
  const nm = join(root, 'node_modules');
  // 顶层（overrides 钉住的版本）
  writePackage(join(nm, 'onnxruntime-node'), '1.23.2');
  writePackage(join(nm, 'onnxruntime-common'), '1.23.2');
  // transformers 嵌套（npm 把它当成冲突版本装进来的那份）
  writePackage(join(nm, '@huggingface', 'transformers', 'node_modules', 'onnxruntime-node'), '1.30.0');
  // onnxruntime-web 自带 dev 版 common（正常嵌套，不得被清理）
  writePackage(join(nm, 'onnxruntime-web', 'node_modules', 'onnxruntime-common'), '1.31.0-dev');
  // 无关包 + pnpm 存储（不得误删）
  writePackage(join(nm, 'vectra'), '0.15.0');
  writePackage(join(nm, '.pnpm', 'onnxruntime-node@1.30.0', 'node_modules', 'onnxruntime-node'), '1.30.0');
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('listNativeCopies', () => {
  test('能找出顶层与嵌套的 onnxruntime-node，按深度升序（浅者在前）', () => {
    const copies = listNativeCopies(root);
    // 路径按相对 node_modules 的 POSIX 形式对比（跨平台：Win 分隔符与 POSIX 不同）
    const prefixDepth = join(root, 'node_modules').split(/[\\/]/).length - 1;
    const paths = copies.map((c) => c.path.split(/[\\/]/).slice(prefixDepth).join('/'));
    assert.deepEqual(paths, [
      'node_modules/onnxruntime-node',
      'node_modules/@huggingface/transformers/node_modules/onnxruntime-node',
    ]);
    assert.equal(copies[0].version, '1.23.2');
    assert.equal(copies[1].version, '1.30.0');
  });

  test('不进入隐藏目录（.pnpm 存储不能被动）', () => {
    const copies = listNativeCopies(root);
    assert.equal(copies.some((c) => c.path.split(/[\\/]/).includes('.pnpm')), false);
  });

  test('onnxruntime-common 不在清理名单里（web 的 dev 版 common 属正常嵌套）', () => {
    const copies = listNativeCopies(root);
    assert.equal(copies.some((c) => c.name === 'onnxruntime-common'), false);
  });

  test('无关包不产生副本记录', () => {
    const copies = listNativeCopies(root);
    assert.equal(copies.some((c) => c.name === 'vectra'), false);
  });
});

describe('pruneNativeDuplicates', () => {
  test('dryRun 只报告不删盘', () => {
    const report = pruneNativeDuplicates(root, { dryRun: true });
    assert.equal(report.removed.length, 1);
    assert.equal(report.failed.length, 0);
    assert.equal(existsSync(join(root, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-node')), true);
  });

  test('真实执行：保留顶层，删掉 transformers 嵌套的那份', () => {
    const report = pruneNativeDuplicates(root);
    assert.equal(report.failed.length, 0);
    assert.deepEqual(report.kept.map((c) => c.version), ['1.23.2']);
    assert.equal(report.removed.length, 1);
    assert.equal(report.removed[0].version, '1.30.0');

    assert.equal(existsSync(join(root, 'node_modules', 'onnxruntime-node', 'package.json')), true);
    assert.equal(existsSync(join(root, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-node')), false);
    // web 的 common、无关包、pnpm 存储必须原样保留
    assert.equal(existsSync(join(root, 'node_modules', 'onnxruntime-web', 'node_modules', 'onnxruntime-common', 'package.json')), true);
    assert.equal(existsSync(join(root, 'node_modules', 'vectra', 'package.json')), true);
    assert.equal(existsSync(join(root, 'node_modules', '.pnpm', 'onnxruntime-node@1.30.0')), true);
  });

  test('重复执行幂等：第二次没有任何改动', () => {
    const report = pruneNativeDuplicates(root);
    assert.equal(report.removed.length, 0);
    assert.equal(report.failed.length, 0);
    assert.equal(report.kept.length, 1);
  });

  test('删不掉时落入 failed 而不抛错（Windows 上 dll 被映射时的真实形态）', async (t) => {
    if (process.platform === 'win32' || process.getuid?.() === 0) {
      t.skip('Windows 的只读目录/root 用户无法复现 EACCES');
      return;
    }
    const locked = mkdtempSync(join(tmpdir(), 'aha-native-guard-locked-'));
    const nestedParent = join(locked, 'node_modules', 'foo', 'node_modules');
    try {
      writePackage(join(locked, 'node_modules', 'onnxruntime-node'), '1.23.2');
      writePackage(join(nestedParent, 'onnxruntime-node'), '1.30.0');
      // 去掉父目录写权限 → 删不掉子目录（等价于 Windows 上文件被占用）
      chmodSync(nestedParent, 0o500);

      const report = pruneNativeDuplicates(locked);
      assert.equal(report.removed.length, 0);
      assert.equal(report.failed.length, 1);
      assert.equal(report.failed[0].version, '1.30.0');
      assert.ok(report.failed[0].error.length > 0);
      // 失败不影响「保留者」的结论，安装流程也不该因此判定失败
      assert.deepEqual(report.kept.map((c) => c.version), ['1.23.2']);
      assert.match(summarizePruneReport(report), /failed to remove onnxruntime-node/);
    } finally {
      chmodSync(nestedParent, 0o755);
      rmSync(locked, { recursive: true, force: true });
    }
  });

  test('摘要可读（安装日志用）', () => {
    const summary = summarizePruneReport({ removed: [{ name: 'onnxruntime-node', version: '1.30.0' }], failed: [] });
    assert.equal(summary, 'removed duplicate onnxruntime-node@1.30.0');
    assert.equal(summarizePruneReport({ removed: [], failed: [] }), null);
  });

  test('包根目录下没有 node_modules 时安全返回空', () => {
    const empty = mkdtempSync(join(tmpdir(), 'aha-native-guard-empty-'));
    try {
      assert.deepEqual(listNativeCopies(empty), []);
      const report = pruneNativeDuplicates(empty);
      assert.deepEqual(report, { removed: [], failed: [], kept: [] });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
