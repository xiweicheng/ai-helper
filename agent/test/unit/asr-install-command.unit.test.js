// agent/test/unit/asr-install-command.unit.test.js
// ASR 依赖安装命令的回归测试（与 rag-install-command.unit.test.js 同构）：
//   1. 包名清单只来自 package.json 的 asrDependencies（单一事实来源），不进
//      optionalDependencies / dependencies —— 否则 `npm i -g ai-helper-agent`
//      会无条件拉取约 300MB 原生包，违背「可选组件、零侵入主流程」。
//   2. 命令必须显式携带 pkg@spec，且 cwd 落在包目录内（安装根项目 = 包自身）。
//   3. Windows 优先 node 直执行 npm-cli.js（shell:false）规避 cmd 对 ^ 的转义。
// 注意：临时 HOME 隔离必须在动态 import install.js 之前设置（模块加载时读状态文件）
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 临时 HOME 隔离：install.js 模块加载时会读 ~/.ai-helper-agent/asr-install-state.json
const home = mkdtempSync(join(tmpdir(), 'asr-install-cmd-'));
process.env.HOME = home;

const mod = await import('../../src/asr/install.js');

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(join(AGENT_ROOT, 'package.json'), 'utf-8'));

after(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('ASR 依赖清单：单一事实来源', () => {
  test('清单来自 package.json 的 asrDependencies（键集一致、spec 完整）', () => {
    const deps = pkg.asrDependencies;
    assert.ok(deps && typeof deps === 'object', 'package.json 应声明 asrDependencies');
    assert.deepEqual([...mod.ASR_INSTALL_PACKAGES].sort(), Object.keys(deps).sort());

    const specs = mod.getAsrInstallSpecs();
    assert.equal(specs.length, Object.keys(deps).length);
    for (const s of specs) {
      assert.match(s, /^\S+@\^\d/, `spec 应为 name@^version 形式: ${s}`);
    }
    assert.ok(specs.some((s) => s.startsWith('sherpa-onnx-node@')), '应包含 sherpa-onnx-node');
  });

  test('ASR 依赖不得放进 dependencies / optionalDependencies（-g 安装会无脑下载）', () => {
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const deps = pkg[field] || {};
      assert.equal(
        deps['sherpa-onnx-node'],
        undefined,
        `sherpa-onnx-node 不得出现在 ${field}：npm -g 安装会自动下载约 300MB 原生包`,
      );
    }
  });
});

describe('buildAsrInstallCommand：跨平台命令构建', () => {
  test('POSIX：直接执行 npm（shell:false），显式携带全部 spec', () => {
    const cmd = mod.buildAsrInstallCommand({ isWin: false });
    assert.equal(cmd.command, 'npm');
    assert.equal(cmd.shell, false);
    assert.deepEqual(cmd.args.slice(0, 4), ['install', '--no-save', '--no-audit', '--no-fund']);
    const specsStart = cmd.args.findIndex((a) => a === 'sherpa-onnx-node@' + pkg.asrDependencies['sherpa-onnx-node']);
    assert.ok(specsStart > 0, 'args 应包含显式 pkg@spec');
    // cwd 为包根（package.json 所在目录）
    const cwdPkg = JSON.parse(readFileSync(join(cmd.cwd, 'package.json'), 'utf-8'));
    assert.equal(cwdPkg.name, 'ai-helper-agent');
  });

  test('POSIX：--registry 只在存在内网镜像时拼接', () => {
    const withRegistry = mod.buildAsrInstallCommand({ isWin: false, registry: 'http://npm.internal/repo' });
    assert.ok(withRegistry.args.some((a) => a === '--registry=http://npm.internal/repo'));

    const withoutRegistry = mod.buildAsrInstallCommand({ isWin: false, registry: null });
    assert.ok(!withoutRegistry.args.some((a) => a.startsWith('--registry=')));
  });

  test('Windows：优先用 node 直执行 npm-cli.js（规避 cmd 的 ^ 转义）', () => {
    const fakeDir = join(home, 'fake-node-win');
    mkdirSync(join(fakeDir, 'node_modules', 'npm', 'bin'), { recursive: true });
    const npmCli = join(fakeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    writeFileSync(npmCli, '// stub', 'utf-8');

    const cmd = mod.buildAsrInstallCommand({ isWin: true, execPath: join(fakeDir, 'node.exe'), registry: null });
    assert.equal(cmd.command, join(fakeDir, 'node.exe'));
    assert.equal(cmd.args[0], npmCli);
    assert.equal(cmd.shell, false);
    assert.deepEqual(cmd.args.slice(1, 5), ['install', '--no-save', '--no-audit', '--no-fund']);
    assert.ok(cmd.args.includes(`sherpa-onnx-node@${pkg.asrDependencies['sherpa-onnx-node']}`));
  });

  test('Windows 回退：npm-cli.js 探测不到时 npm.cmd + 引号包装 spec', () => {
    const cmd = mod.buildAsrInstallCommand({
      isWin: true,
      execPath: join(home, 'no-such-node', 'node.exe'),
      registry: null,
    });
    assert.equal(cmd.command, 'npm.cmd');
    assert.equal(cmd.shell, true);
    assert.deepEqual(cmd.args.slice(0, 4), ['install', '--no-save', '--no-audit', '--no-fund']);
    assert.deepEqual(cmd.args.slice(4), mod.getAsrInstallSpecs().map((s) => `"${s}"`));
  });

  test('清单为空（包损坏/被裁剪）：抛错拒绝构建，绝不退化为无包名安装', () => {
    assert.throws(() => mod.buildAsrInstallCommand({ isWin: false, specs: [] }), /asrDependencies/);
    assert.throws(() => mod.buildAsrInstallCommand({ isWin: true, execPath: process.execPath, specs: [] }), /asrDependencies/);
  });
});

describe('安装任务状态', () => {
  test('未安装过时状态为空语义（running=false, everSucceeded=false）', () => {
    const status = mod.getAsrInstallStatus();
    assert.equal(status.running, false);
    assert.equal(status.done, false);
    assert.equal(status.everSucceeded, false);
    assert.equal(status.phase, null);
    assert.deepEqual([...status.packages].sort(), [...mod.ASR_INSTALL_PACKAGES].sort());
    assert.equal(mod.hasAsrEverInstalled(), false);
  });

  test('无运行中任务时 stopAsrInstall 幂等返回 false', async () => {
    assert.equal(await mod.stopAsrInstall(), false);
  });
});
