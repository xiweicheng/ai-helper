// agent/test/unit/rag-ingest-path-sandbox.unit.test.js
// RAG 文件导入 path 分支沙箱单测：越权路径必须被 checkPath 拒绝（与 /api/fs/read 同一套规则）
// 背景：path 分支曾直接读任意宿主文件（可绕过 allowedPaths 与硬阻止清单），本测试防回归
// 运行：node --test agent/test/unit/rag-ingest-path-sandbox.unit.test.js
//
// 数据目录隔离：AGENT_DIR 在 config.js / security.js 顶层由 homedir() 求值，且没有环境变量开关。
// 本文件原先直接用真实 homedir 下的 workspace 构造"应被放行"的路径，等于每次跑单测都往用户的
// agent 数据目录里写文件（靠 finally 删除，中途崩溃就留残留）。这里改为在导入被测模块前把 HOME
// 指向临时目录 —— 必须用动态 import，因为静态 import 会先于任何顶层语句求值。
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { homedir as realHomedir, tmpdir } from 'os';
import { join, dirname } from 'path';
import { mkdtempSync, readdirSync, existsSync } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';

const REAL_HOME = realHomedir();
const SANDBOX_HOME = mkdtempSync(join(tmpdir(), 'aha-rag-sandbox-home-'));
process.env.HOME = SANDBOX_HOME;
process.env.USERPROFILE = SANDBOX_HOME; // Windows 下 os.homedir() 读这个

const { RagManager } = await import('../../src/rag/manager.js');
const { RagError } = await import('../../src/rag/errors.js');

const SANDBOX_AGENT_DIR = join(SANDBOX_HOME, '.ai-helper-agent');

// 记下真实数据目录的原貌，收尾时比对：单测不该在里面留任何东西
const realWorkspaceDir = join(REAL_HOME, '.ai-helper-agent', 'workspace');
const realWorkspaceBefore = (() => {
  try {
    return readdirSync(realWorkspaceDir).sort();
  } catch {
    return null; // 目录不存在（干净机器 / CI）
  }
})();

// 断言：以 pathNotAllowed 错误码被沙箱拦截
const isPathNotAllowed = (err) => {
  assert.ok(err instanceof RagError, `期望 RagError 拒绝，实际: ${err.constructor.name}: ${err.message}`);
  assert.equal(err.code, 'pathNotAllowed');
  return true;
};

describe('ingestFile path 分支 - 文件沙箱', () => {
  test('拒绝读取硬阻止文件（agent 配对记录 pairings.json）', async () => {
    const manager = new RagManager();
    const blocked = join(SANDBOX_AGENT_DIR, 'pairings.json');
    await assert.rejects(
      () => manager.ingestFile('kb_sandbox0test', { path: blocked }),
      isPathNotAllowed
    );
  });

  test('拒绝读取 allowedPaths 之外的任意本地文件', async () => {
    const manager = new RagManager();
    const outside = join(tmpdir(), 'rag-sandbox-outside.txt');
    await assert.rejects(
      () => manager.ingestFile('kb_sandbox0test', { path: outside }),
      isPathNotAllowed
    );
  });

  test('允许目录内文件不被沙箱误拦（后续因知识库不存在等其它原因失败）', async () => {
    const manager = new RagManager();
    const allowed = join(SANDBOX_AGENT_DIR, 'workspace', `rag-sandbox-allowed-${Date.now()}.txt`);
    await mkdir(dirname(allowed), { recursive: true });
    await writeFile(allowed, '沙箱放行测试内容', 'utf-8');
    try {
      await assert.rejects(
        () => manager.ingestFile('kb_sandbox0test', { path: allowed }),
        (err) => !(err instanceof RagError && err.code === 'pathNotAllowed')
      );
    } finally {
      await unlink(allowed).catch(() => {});
    }
  });

  // 隔离生效的判据：被测试代码自己建出来的数据根必须落在临时目录里。
  // 没有这一条，哪天有人删了上面的 HOME 覆盖，本文件会静默退回写真实目录而不是报错。
  test('被测模块的数据根确实解析到临时目录（HOME 覆盖生效）', () => {
    assert.ok(
      existsSync(SANDBOX_AGENT_DIR),
      `临时 agent 数据目录未被创建，说明 config.js / security.js 用的不是沙箱 HOME`
    );
  });
});

after(() => {
  if (realWorkspaceBefore === null) return;
  const now = readdirSync(realWorkspaceDir).sort();
  assert.deepEqual(
    now,
    realWorkspaceBefore,
    `单测改动了用户真实 agent 数据目录：${realWorkspaceDir}`
  );
});
