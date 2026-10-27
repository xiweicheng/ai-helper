// agent/test/unit/session-workdir-scope.unit.test.js
// checkPath 会话上下文单元测试：相对路径基准、会话目录放行、越界拒绝、硬阻止优先、realpath 逃逸
// 运行：node --test agent/test/unit/session-workdir-scope.unit.test.js
//
// 用临时 HOME 隔离：config.js 在导入时就用 os.homedir() 算出 AGENT_DIR，
// 因此必须先改 HOME 再动态 import，避免读到本机真实配置。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TMP_HOME = mkdtempSync(join(tmpdir(), 'aih-scope-'));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;

const AGENT_DIR = join(TMP_HOME, '.ai-helper-agent');
const GLOBAL_WORKDIR = join(AGENT_DIR, 'workspace');
const SESSION_A = join(TMP_HOME, 'proj-a');
const SESSION_B = join(TMP_HOME, 'proj-b');

/** @type {typeof import('../../src/security.js')} */
let security;

before(async () => {
  mkdirSync(GLOBAL_WORKDIR, { recursive: true });
  mkdirSync(SESSION_A, { recursive: true });
  mkdirSync(SESSION_B, { recursive: true });
  writeFileSync(join(SESSION_A, 'a.txt'), 'a');
  writeFileSync(join(SESSION_B, 'b.txt'), 'b');
  writeFileSync(join(AGENT_DIR, 'config.json'), JSON.stringify({
    port: 18910,
    host: '127.0.0.1',
    workdir: GLOBAL_WORKDIR,
    allowedPaths: [GLOBAL_WORKDIR],
  }, null, 2));
  security = await import('../../src/security.js');
});

after(() => {
  rmSync(TMP_HOME, { recursive: true, force: true });
});

describe('checkPath - 会话上下文解析', () => {
  test('相对路径按会话有效目录解析', async () => {
    const r = await security.checkPath('notes/a.txt', null, { sessionId: 'session_a', workdir: SESSION_A });
    assert.equal(r.allowed, true);
    assert.equal(r.resolved, join(SESSION_A, 'notes', 'a.txt'));
  });

  test('会话目录自身与其子路径放行', async () => {
    const self = await security.checkPath(SESSION_A, null, { workdir: SESSION_A });
    assert.equal(self.allowed, true);
    const child = await security.checkPath(join(SESSION_A, 'a.txt'), null, { workdir: SESSION_A });
    assert.equal(child.allowed, true);
  });

  test('两个会话的目录互相越界：各自只放行自己的目录', async () => {
    const fromA = await security.checkPath(join(SESSION_B, 'b.txt'), null, { workdir: SESSION_A });
    assert.equal(fromA.allowed, false);
    const fromB = await security.checkPath(join(SESSION_A, 'a.txt'), null, { workdir: SESSION_B });
    assert.equal(fromB.allowed, false);
  });

  test('未传 ctx 时回落全局默认目录（旧行为不变）', async () => {
    const r = await security.checkPath('a.txt');
    assert.equal(r.allowed, true);
    assert.equal(r.resolved, join(GLOBAL_WORKDIR, 'a.txt'));
  });

  test('ctx.workdir 为空串时回落全局默认目录', async () => {
    const r = await security.checkPath('a.txt', null, { workdir: '' });
    assert.equal(r.allowed, true);
    assert.equal(r.resolved, join(GLOBAL_WORKDIR, 'a.txt'));
  });
});

describe('checkPath - 硬阻止优先于会话目录放行', () => {
  test('注册表文件不可读写（会话目录设成代理系统目录也不行）', async () => {
    for (const name of ['session-workdirs.json', 'session-workdirs.json.tmp']) {
      const r = await security.checkPath(join(AGENT_DIR, name), null, { workdir: AGENT_DIR });
      assert.equal(r.allowed, false, `${name} 必须被硬阻止`);
    }
  });

  test('config.json / pairings.json 同样硬阻止', async () => {
    for (const name of ['config.json', 'pairings.json']) {
      const r = await security.checkPath(join(AGENT_DIR, name), null, { workdir: AGENT_DIR });
      assert.equal(r.allowed, false, `${name} 必须被硬阻止`);
    }
  });
});

describe('checkPath - realpath 复查（符号链接不能借会话目录跳出沙箱）', () => {
  test('会话目录内的符号链接指向会话外目录时拒绝', async () => {
    const link = join(SESSION_A, 'escape');
    try {
      symlinkSync(SESSION_B, link, 'dir');
    } catch {
      return; // 无符号链接权限的环境（部分 Windows）跳过
    }
    const r = await security.checkPath(join(link, 'b.txt'), null, { workdir: SESSION_A });
    assert.equal(r.allowed, false, '链接的真实路径落在会话外，必须拒绝');
  });

  test('会话目录内的符号链接指向代理系统文件时拒绝', async () => {
    const link = join(SESSION_A, 'pwn.json');
    try {
      symlinkSync(join(AGENT_DIR, 'config.json'), link);
    } catch {
      return;
    }
    const r = await security.checkPath(link, null, { workdir: SESSION_A });
    assert.equal(r.allowed, false, '链接指向硬阻止文件，必须拒绝');
  });

  test('会话目录内的普通文件仍然放行（不误伤）', async () => {
    const r = await security.checkPath(join(SESSION_A, 'a.txt'), null, { workdir: SESSION_A });
    assert.equal(r.allowed, true);
  });
});
