// agent/test/unit/rag-install-command.unit.test.js
// RAG 依赖安装加固（显式包名清单）的回归测试：
//   背景（R7 实测）：npm overrides 仅在包自身作为根项目安装时生效；npm -g 全局安装不读
//   包内 overrides，会把 RAG 传递依赖 onnxruntime-node 装到无 darwin-x64 二进制的高版本
//   （Intel Mac 加载失败），且 optionalDependencies 随 -g 安装自动下载，形成「装了但
//   不可用」的坏状态。
//   加固：RAG 依赖改由 package.json 自定义字段 ragDependencies 声明（npm 对自定义字段
//   不做自动安装），一键安装在包目录内显式执行 `npm install --no-save pkg@spec ...`
//   ——包目录是安装根项目，overrides 生效，一次装对。
// 注意：临时 HOME 隔离必须在动态 import install.js 之前设置（模块加载时读取状态文件）
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 临时 HOME 隔离：install.js 模块加载时会读 ~/.ai-helper-agent/rag-install-state.json
const home = mkdtempSync(join(tmpdir(), 'rag-install-cmd-'));
process.env.HOME = home;

const { RAG_INSTALL_PACKAGES, getRagInstallSpecs, buildRagInstallCommand } = await import('../../src/rag/install.js');

// agent 包根目录（测试位于 <agent>/test/unit/，向上两级）
const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(join(AGENT_ROOT, 'package.json'), 'utf-8'));

after(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('RAG 依赖清单：单一事实来源与防回迁', () => {
  test('清单来自 package.json 的 ragDependencies（键集一致、spec 完整）', () => {
    const deps = pkg.ragDependencies;
    assert.ok(deps && typeof deps === 'object', 'package.json 应声明 ragDependencies');
    assert.deepEqual([...RAG_INSTALL_PACKAGES].sort(), Object.keys(deps).sort());

    const specs = getRagInstallSpecs();
    assert.equal(specs.length, Object.keys(deps).length);
    for (const s of specs) {
      assert.match(s, /@\^\d/, `spec 应为 name@^version 形式: ${s}`);
    }
    // scoped 包名保留（@huggingface/transformers@^4.0.0）
    assert.ok(specs.some((s) => s.startsWith('@huggingface/transformers@')), 'scoped 包 spec 应保留');
  });

  test('RAG 依赖不得回迁 optionalDependencies（-g 安装会自动装出坏版本）', () => {
    assert.equal(
      pkg.optionalDependencies,
      undefined,
      'RAG 依赖不得放在 optionalDependencies：npm -g 安装会自动下载且包内 overrides 不生效',
    );
  });
});

describe('buildRagInstallCommand：跨平台命令构建', () => {
  test('POSIX：直接执行 npm（shell:false），显式携带全部 spec', () => {
    const cmd = buildRagInstallCommand({ isWin: false });
    assert.equal(cmd.command, 'npm');
    assert.equal(cmd.shell, false);
    assert.deepEqual(cmd.args.slice(0, 4), ['install', '--no-save', '--no-audit', '--no-fund']);
    assert.deepEqual(cmd.args.slice(4), getRagInstallSpecs());
    // cwd 为包根（package.json 所在目录）：保证安装根项目 = 包自身，overrides 生效
    const cwdPkg = JSON.parse(readFileSync(join(cmd.cwd, 'package.json'), 'utf-8'));
    assert.equal(cwdPkg.name, 'ai-helper-agent');
  });

  test('Windows：优先用 node 直执行 npm-cli.js（规避 cmd 的 ^ 转义）', () => {
    const fakeDir = join(home, 'fake-node-win');
    mkdirSync(join(fakeDir, 'node_modules', 'npm', 'bin'), { recursive: true });
    const npmCli = join(fakeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    writeFileSync(npmCli, '// stub', 'utf-8');

    const cmd = buildRagInstallCommand({ isWin: true, execPath: join(fakeDir, 'node.exe') });
    assert.equal(cmd.command, join(fakeDir, 'node.exe'));
    assert.equal(cmd.args[0], npmCli);
    assert.equal(cmd.shell, false);
    assert.deepEqual(cmd.args.slice(1, 5), ['install', '--no-save', '--no-audit', '--no-fund']);
    assert.deepEqual(cmd.args.slice(5), getRagInstallSpecs());
  });

  test('Windows 回退：npm-cli.js 探测不到时 npm.cmd + 引号包装 spec（cmd 引号内 ^ 为字面量）', () => {
    const cmd = buildRagInstallCommand({ isWin: true, execPath: join(home, 'no-such-node', 'node.exe') });
    assert.equal(cmd.command, 'npm.cmd');
    assert.equal(cmd.shell, true);
    assert.deepEqual(cmd.args.slice(0, 4), ['install', '--no-save', '--no-audit', '--no-fund']);
    assert.deepEqual(cmd.args.slice(4), getRagInstallSpecs().map((s) => `"${s}"`));
  });

  test('清单为空（包损坏/被裁剪）：抛错拒绝构建，绝不退化为无包名安装', () => {
    assert.throws(() => buildRagInstallCommand({ isWin: false, specs: [] }), /ragDependencies/);
    assert.throws(() => buildRagInstallCommand({ isWin: true, execPath: process.execPath, specs: [] }), /ragDependencies/);
  });
});
