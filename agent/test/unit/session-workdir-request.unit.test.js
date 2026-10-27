// agent/test/unit/session-workdir-request.unit.test.js
// 请求级会话作用域单元测试：X-AIH-Session-Id / X-AIH-Workdir 采纳矩阵 + /api/exec 的 cwd 归一
// 运行：node --test agent/test/unit/session-workdir-request.unit.test.js
//
// 这一层是「扩展端冻结目录」与「代理端权限校验」的接缝：
// 头里的目录一旦被无条件采纳，就等于把沙箱目录交给客户端任意指定；
// 所以采纳条件写死为「等于该会话注册值」或「未注册且等于全局默认」。
//
// 临时 HOME 隔离：config.js 在导入时用 os.homedir() 算出 AGENT_DIR，
// 必须先改 HOME 再动态 import，避免读到本机真实配置。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP_HOME = mkdtempSync(join(tmpdir(), 'aih-req-scope-'));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;

const AGENT_DIR = join(TMP_HOME, '.ai-helper-agent');
const GLOBAL_WORKDIR = join(AGENT_DIR, 'workspace');
const SESSION_A = join(TMP_HOME, 'proj-a');
const SESSION_B = join(TMP_HOME, 'proj-b');

const SESSION = 'sess_a_1';
const OTHER_SESSION = 'sess_b_1';

let registry;
let resolveRequestScope;
let resolveExecCwd;

/** 构造请求：node 会把头名小写化，这里直接给小写键 */
const req = (headers = {}) => ({ headers });

before(async () => {
  for (const dir of [GLOBAL_WORKDIR, SESSION_A, SESSION_B, join(SESSION_A, 'sub')]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(AGENT_DIR, 'config.json'), JSON.stringify({
    port: 18910,
    host: '127.0.0.1',
    workdir: GLOBAL_WORKDIR,
    allowedPaths: [GLOBAL_WORKDIR],
  }, null, 2));

  registry = await import('../../src/session-workdirs.js');
  ({ resolveRequestScope, resolveExecCwd } = await import('../../src/server.js'));
  await registry.bindSessionWorkdir(SESSION, SESSION_A);
});

after(async () => {
  try { await registry.unbindSessionWorkdir(SESSION); } catch { /* 忽略 */ }
  try { rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

describe('resolveRequestScope - 会话头解析', () => {
  test('无会话头：回落全局默认', () => {
    const scope = resolveRequestScope(req());
    assert.equal(scope.sessionId, null);
    assert.equal(scope.registered, null);
    assert.equal(scope.scope, 'default');
    assert.equal(scope.workdir, GLOBAL_WORKDIR);
    assert.equal(scope.globalWorkdir, GLOBAL_WORKDIR);
  });

  test('已绑定会话：用会话自己的目录', () => {
    const scope = resolveRequestScope(req({ 'x-aih-session-id': SESSION }));
    assert.equal(scope.sessionId, SESSION);
    assert.equal(scope.scope, 'session');
    assert.equal(scope.workdir, SESSION_A);
    assert.equal(scope.registered, SESSION_A);
    // 全局默认仍要如实返回，扩展端据此渲染「默认」态
    assert.equal(scope.globalWorkdir, GLOBAL_WORKDIR);
  });

  test('未绑定会话：仍用全局默认', () => {
    const scope = resolveRequestScope(req({ 'x-aih-session-id': OTHER_SESSION }));
    assert.equal(scope.sessionId, OTHER_SESSION);
    assert.equal(scope.scope, 'default');
    assert.equal(scope.workdir, GLOBAL_WORKDIR);
    assert.equal(scope.registered, null);
  });

  test('非法 sessionId（格式白名单外）：按无会话处理，不污染注册表', () => {
    for (const bad of ['has.dot', 'a'.repeat(65), '../escape', '有中文']) {
      const scope = resolveRequestScope(req({ 'x-aih-session-id': bad }));
      assert.equal(scope.sessionId, null, `应忽略非法 id: ${bad}`);
      assert.equal(scope.workdir, GLOBAL_WORKDIR);
    }
  });

  test('派生会话（子任务/子代理）：沿用主会话的注册值', () => {
    for (const derived of [`${SESSION}_subtask_0`, `${SESSION}_sub_agent-x`]) {
      const scope = resolveRequestScope(req({ 'x-aih-session-id': derived }));
      assert.equal(scope.scope, 'session', derived);
      assert.equal(scope.workdir, SESSION_A, derived);
    }
  });
});

describe('X-AIH-Workdir 采纳矩阵（冻结值不得成为提权入口）', () => {
  test('等于该会话注册值：采纳', () => {
    const scope = resolveRequestScope(req({
      'x-aih-session-id': SESSION,
      'x-aih-workdir': encodeURIComponent(SESSION_A),
    }));
    assert.equal(scope.workdir, SESSION_A);
  });

  test('不等于注册值：忽略并回落注册值（不按旧/外部目录执行）', () => {
    for (const bogus of ['/etc', join(TMP_HOME, 'proj-b')]) {
      const scope = resolveRequestScope(req({
        'x-aih-session-id': SESSION,
        'x-aih-workdir': encodeURIComponent(bogus),
      }));
      assert.equal(scope.workdir, SESSION_A, `应忽略 ${bogus}`);
    }
  });

  test('会话未注册 + 等于全局默认：采纳（等价，不改变语义）', () => {
    const scope = resolveRequestScope(req({
      'x-aih-session-id': OTHER_SESSION,
      'x-aih-workdir': encodeURIComponent(GLOBAL_WORKDIR),
    }));
    assert.equal(scope.workdir, GLOBAL_WORKDIR);
  });

  test('会话未注册 + 不等于全局默认：忽略', () => {
    const scope = resolveRequestScope(req({
      'x-aih-session-id': OTHER_SESSION,
      'x-aih-workdir': encodeURIComponent(SESSION_A),
    }));
    assert.equal(scope.workdir, GLOBAL_WORKDIR);
  });

  test('无会话头的冻结值：只在等于全局默认时采纳', () => {
    assert.equal(
      resolveRequestScope(req({ 'x-aih-workdir': encodeURIComponent(GLOBAL_WORKDIR) })).workdir,
      GLOBAL_WORKDIR,
    );
    assert.equal(
      resolveRequestScope(req({ 'x-aih-workdir': encodeURIComponent(SESSION_A) })).workdir,
      GLOBAL_WORKDIR,
    );
  });
});

describe('resolveExecCwd - /api/exec 的 cwd 语义', () => {
  const scopeFor = (sessionId) => resolveRequestScope(req(sessionId ? { 'x-aih-session-id': sessionId } : {}));
  const tFn = (key, params) => `${key}${params ? JSON.stringify(params) : ''}`;

  test('cwd 缺省：用本会话有效目录', async () => {
    const result = await resolveExecCwd(undefined, scopeFor(SESSION), tFn);
    assert.equal(result.allowed, true);
    assert.equal(result.cwd, SESSION_A);
    assert.equal(result.requested, '');
  });

  test('cwd 为空串或空白：同样按缺省处理', async () => {
    for (const blank of ['', '   ']) {
      const result = await resolveExecCwd(blank, scopeFor(SESSION), tFn);
      assert.equal(result.allowed, true);
      assert.equal(result.cwd, SESSION_A, JSON.stringify(blank));
    }
  });

  test('相对 cwd：按会话有效目录解析', async () => {
    const result = await resolveExecCwd('sub', scopeFor(SESSION), tFn);
    assert.equal(result.allowed, true);
    assert.equal(result.cwd, join(SESSION_A, 'sub'));
  });

  test('会话目录内的绝对 cwd：保留', async () => {
    const result = await resolveExecCwd(join(SESSION_A, 'sub'), scopeFor(SESSION), tFn);
    assert.equal(result.allowed, true);
    assert.equal(result.cwd, join(SESSION_A, 'sub'));
  });

  test('越界的绝对 cwd：拒绝并给出本会话目录作为 hint', async () => {
    const result = await resolveExecCwd('/etc', scopeFor(SESSION), tFn);
    assert.equal(result.allowed, false);
    assert.ok(result.reason, '应带拒绝原因');
    assert.equal(result.hint, SESSION_A);
  });

  test('相对逃逸（../..）：同样被拒绝', async () => {
    const result = await resolveExecCwd('../..', scopeFor(SESSION), tFn);
    assert.equal(result.allowed, false);
  });

  test('别的会话的目录不能借用（跨会话隔离）', async () => {
    await registry.bindSessionWorkdir(OTHER_SESSION, SESSION_B);
    try {
      const result = await resolveExecCwd(SESSION_B, scopeFor(SESSION), tFn);
      assert.equal(result.allowed, false);
      assert.equal(result.hint, SESSION_A);
    } finally {
      await registry.unbindSessionWorkdir(OTHER_SESSION);
    }
  });
});

describe('路由契约（源码守卫：状态详情 / 解绑 / 403 提示）', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const serverSrc = readFileSync(join(ROOT, 'src', 'server.js'), 'utf-8');

  test('/api/status/detail 同时下发 workdir 与 defaultWorkdir + 特性字段', () => {
    assert.match(serverSrc, /workdir:\s*scope\.workdir/);
    assert.match(serverSrc, /defaultWorkdir:\s*config\.workdir/);
    assert.match(serverSrc, /sessionWorkdir:\s*scope\.registered/);
    assert.match(serverSrc, /sessionWorkdirSupported:\s*true/);
  });

  test('/api/config/workdir 支持 sessionId，且有解绑路由', () => {
    assert.match(serverSrc, /hasSessionParam/);
    assert.match(serverSrc, /bindSessionWorkdir/);
    assert.match(serverSrc, /\/api\/config\/workdir\/unbind/);
    assert.match(serverSrc, /unbindSessionWorkdir/);
  });

  test('exec 越界的 403 带 hint，便于模型自我纠正', () => {
    assert.match(serverSrc, /hint:\s*cwdCheck\.hint/);
    assert.match(serverSrc, /error\.workdirNotInSessionScope/);
  });

  test('请求级作用域贯穿 fs 路由（不是每处各读全局 workdir）', () => {
    const fsCalls = serverSrc.match(/checkPath\([^)]*scope\s*\)/g) || [];
    assert.ok(fsCalls.length >= 4, `checkPath 带 scope 的调用点太少: ${fsCalls.length}`);
  });
});
