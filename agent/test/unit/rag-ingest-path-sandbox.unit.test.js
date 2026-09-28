// agent/test/unit/rag-ingest-path-sandbox.unit.test.js
// RAG 文件导入 path 分支沙箱单测：越权路径必须被 checkPath 拒绝（与 /api/fs/read 同一套规则）
// 背景：path 分支曾直接读任意宿主文件（可绕过 allowedPaths 与硬阻止清单），本测试防回归
// 运行：node --test agent/test/unit/rag-ingest-path-sandbox.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { homedir, tmpdir } from 'os';
import { join, dirname } from 'path';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { RagManager } from '../../src/rag/manager.js';
import { RagError } from '../../src/rag/errors.js';

// 断言：以 pathNotAllowed 错误码被沙箱拦截
const isPathNotAllowed = (err) => {
  assert.ok(err instanceof RagError, `期望 RagError 拒绝，实际: ${err.constructor.name}: ${err.message}`);
  assert.equal(err.code, 'pathNotAllowed');
  return true;
};

describe('ingestFile path 分支 - 文件沙箱', () => {
  test('拒绝读取硬阻止文件（agent 配对记录 pairings.json）', async () => {
    const manager = new RagManager();
    const blocked = join(homedir(), '.ai-helper-agent', 'pairings.json');
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
    const allowed = join(homedir(), '.ai-helper-agent', 'workspace', `rag-sandbox-allowed-${Date.now()}.txt`);
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
});
