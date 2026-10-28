// agent/test/unit/session-workdir-scope-sinks.unit.test.js
// 路径判定「汇聚点」必须携带请求级会话上下文
// 运行：node --test agent/test/unit/session-workdir-scope-sinks.unit.test.js
//
// 背景：会话级绑定**刻意不写** config.allowedPaths —— 否则删会话会留下永久授权，
// 沙箱会被逐步撑成整个文件系统。代价是：任何一处 checkPath 忘了传 ctx，
// 该会话目录立刻变成「不在允许目录」，表现为用户侧莫名其妙的 403。
//
// 所以这里锁两件事：
//   1. 行为：带 ctx 放行会话目录、不带 ctx 拒绝（证明 ctx 是必需的，不是可选的）
//   2. 源码契约：文件 / 命令 cwd / 搜索 / RAG 导入 四条链路都把 ctx 透传到底
//
// 临时 HOME 隔离：config.js 在导入时用 os.homedir() 算出 AGENT_DIR，
// 必须先改 HOME 再动态 import，避免读到本机真实配置。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP_HOME = mkdtempSync(join(tmpdir(), 'aih-scope-sinks-'));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;

const AGENT_DIR = join(TMP_HOME, '.ai-helper-agent');
const GLOBAL_WORKDIR = join(AGENT_DIR, 'workspace');
const SESSION_A = join(TMP_HOME, 'proj-a');
const SESSION = 'sess_sinks_1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf-8');

let checkPath;
let registry;

before(async () => {
  for (const dir of [GLOBAL_WORKDIR, SESSION_A]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(AGENT_DIR, 'config.json'), JSON.stringify({
    port: 18910,
    host: '127.0.0.1',
    workdir: GLOBAL_WORKDIR,
    allowedPaths: [GLOBAL_WORKDIR],
  }, null, 2));
  writeFileSync(join(SESSION_A, 'note.txt'), 'hello');
  writeFileSync(join(TMP_HOME, 'outside.txt'), 'secret');

  ({ checkPath } = await import('../../src/security.js'));
  registry = await import('../../src/session-workdirs.js');
  await registry.bindSessionWorkdir(SESSION, SESSION_A);
});

after(async () => {
  try { await registry.unbindSessionWorkdir(SESSION); } catch { /* 忽略 */ }
  try { rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

describe('checkPath 的会话上下文：带 ctx 放行，不带 ctx 拒绝', () => {
  test('会话目录刻意不在 allowedPaths 里（授权可回收的前提）', async () => {
    const disk = JSON.parse(readFileSync(join(AGENT_DIR, 'config.json'), 'utf-8'));
    assert.equal(disk.allowedPaths.some((p) => p === SESSION_A), false);
  });

  test('带 ctx.workdir：会话目录内的相对路径与绝对路径都放行', async () => {
    const ctx = { sessionId: SESSION, workdir: SESSION_A };

    const rel = await checkPath('note.txt', undefined, ctx);
    assert.equal(rel.allowed, true);
    assert.equal(rel.resolved, join(SESSION_A, 'note.txt'));

    const abs = await checkPath(join(SESSION_A, 'note.txt'), undefined, ctx);
    assert.equal(abs.allowed, true);
  });

  test('不带 ctx：同一路径被判越界（漏传 ctx 就是用户看到的「误拦截」）', async () => {
    const noCtx = await checkPath(join(SESSION_A, 'note.txt'));
    assert.equal(noCtx.allowed, false);
  });

  test('带 ctx 也不能越出会话目录去读别处', async () => {
    const ctx = { sessionId: SESSION, workdir: SESSION_A };
    assert.equal((await checkPath(join(TMP_HOME, 'outside.txt'), undefined, ctx)).allowed, false);
    assert.equal((await checkPath('../outside.txt', undefined, ctx)).allowed, false);
  });

  test('会话目录下尚不存在的文件放行（待创建），仍受硬阻止约束', async () => {
    const ctx = { sessionId: SESSION, workdir: SESSION_A };
    assert.equal((await checkPath('new-file.txt', undefined, ctx)).allowed, true);
    assert.equal((await checkPath(join(AGENT_DIR, 'config.json'), undefined, ctx)).allowed, false);
  });
});

describe('路径判定汇聚点：四条链路都把 ctx 透传到底', () => {
  test('技能执行：文件读取 / 命令 cwd / 搜索 三处都带 ctx', () => {
    const s = src('skill/executor.js');
    assert.match(s, /checkPath\(args\.path, undefined, ctx\)/);
    assert.match(s, /checkPath\(args\.cwd \|\| '\.', undefined, ctx\)/);
    assert.match(s, /searchContent\([\s\S]*?\btr,\s*ctx\s*\)/);
    assert.match(s, /searchFiles\([\s\S]*?\btr,\s*ctx\s*\)/);
  });

  test('技能里的 agent_exec 不再用 process.cwd() 当默认目录', () => {
    const s = src('skill/executor.js');
    // 回归重点：process.cwd() 是代理进程目录，多会话下既可能错位又绕过沙箱
    assert.doesNotMatch(s, /executeCommandSync\(args\.command,\s*args\.cwd \|\| process\.cwd\(\)\)/);
    assert.match(s, /executeCommandSync\(args\.command, cwdCheck\.resolved\)/);
  });

  test('技能执行链把 ctx 从 runSkill 一路传到 executeToolCall', () => {
    const reg = src('skill/registry.js');
    assert.match(reg, /runSkill\(name, params = \{\}, onStepUpdate, ctx = \{\}\)/);
    assert.match(reg, /executeSkill\(skill, params, onStepUpdate, ctx\)/);

    const ex = src('skill/executor.js');
    assert.match(ex, /executeSkill\(skill, params = \{\}, onStepUpdate, ctx = \{\}\)/);
    assert.match(ex, /executeSkillSteps\(skill, params, execId, notify, ctx\)/);
    assert.match(ex, /executeToolCall\(step\.tool, renderedParams, ctx\)/);
  });

  test('RAG 导入本地文件透传 ctx', () => {
    const mgr = src('rag/manager.js');
    assert.match(mgr, /ingestFile\(collectionId, input = \{\}, ctx = \{\}\)/);
    assert.match(mgr, /checkPath\(input\.path, undefined, ctx\)/);

    const routes = src('rag/routes.js');
    assert.match(routes, /ragRouter\(req, res, pathname, url, t, body = \{\}, ctx = \{\}\)/);
    assert.match(routes, /manager\.ingestFile\([\s\S]*?\}, ctx\)/);
  });

  test('server.js 把请求级 scope 交给技能与 RAG', () => {
    const s = src('server.js');
    assert.match(s, /runSkill\(body\.name, body\.params \|\| \{\}, undefined, scope\)/);
    assert.match(s, /ragRouter\(req, res, pathname, url, t, requestBody, scope\)/);
  });

  test('文档图片提取仍传 sessionCtx（防回退）', () => {
    assert.match(src('server.js'), /extractImagesHandler\(body, \{ t, sessionCtx: scope \}\)/);
  });

  test('fs / exec / search 的 HTTP 入口仍传 scope（防回退）', () => {
    const s = src('server.js');
    assert.match(s, /searchFiles\([\s\S]*?\bt,\s*scope\s*\)/);
    assert.match(s, /searchContent\([\s\S]*?\bt,\s*scope\s*\)/);
    assert.match(s, /resolveExecCwd\(cwd, scope, t\)/);
  });
});
