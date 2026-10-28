/**
 * session-workdir.smoke.mjs - 会话级工作目录 Agent 端运行期冒烟（真 HTTP，真进程）
 *
 * 手动运行：node agent/test/smoke/session-workdir.smoke.mjs
 * （不纳入 `npm test`：不是 *.test.js）
 *
 * 为什么需要它：单元测试只能证明「函数按预期返回」，
 * 而这条链路的真实风险在「装配」——请求头是否正确贯穿到 checkPath、注册表是否真的解出目录、
 * 全局 config 是否被会话绑定污染。所以这里起真服务、过真鉴权、跑真 shell。
 *
 * 隔离策略（不干扰本机已安装的 agent）：
 * - 独立临时 HOME（数据目录随 homedir() 落到 tmp）
 * - 独立端口 18978（默认 18910 可能被占用）
 * - 进程内直接 startServer()，不写用户 config.json / pidfile
 *
 * 覆盖（对应计划 §5 / §6 / §12）：
 *   1. 会话绑定不写全局 config、不改 allowedPaths
 *   2. /api/status/detail 有/无会话头的 workdir 与 defaultWorkdir
 *   3. /api/exec：cwd 缺省 / 相对 / 目录内绝对 / 越界 403 + hint
 *   4. 跨会话隔离：A 绑定与 B 绑定互不影响，改 B 不改 A 的执行目录
 *   5. X-AIH-Workdir 采纳矩阵：等于注册值采纳、不等忽略、未注册只认全局
 *   6. /api/fs/* 走会话上下文（相对路径落会话目录）
 *   7. unbind 后回落全局默认
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PORT = 18978;
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

const home = mkdtempSync(join(tmpdir(), 'aihelper-wd-smoke-'));
const agentDir = join(home, '.ai-helper-agent');
mkdirSync(agentDir, { recursive: true });
const GLOBAL_WORKDIR = join(agentDir, 'workspace');
const DIR_A = join(home, 'proj-a');
const DIR_B = join(home, 'proj-b');
for (const dir of [GLOBAL_WORKDIR, DIR_A, DIR_B, join(DIR_A, 'sub'), join(DIR_B, 'sub')]) {
  mkdirSync(dir, { recursive: true });
}
const CONFIG_PATH = join(agentDir, 'config.json');
writeFileSync(CONFIG_PATH, JSON.stringify({ port: PORT, host: HOST, workdir: GLOBAL_WORKDIR, allowedPaths: [GLOBAL_WORKDIR] }, null, 2));

// 必须在导入 config.js/server.js 之前设置（config 模块在加载时用 homedir() 解析数据目录）
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.AI_HELPER_LANG = 'zh';

/** macOS 的 /var → /private/var 会让字符串比较假失败，比较前统一取 realpath */
function realOrSelf(p) {
  try { return realpathSync(p); } catch { return p; }
}
function samePath(a, b) {
  if (!a || !b) return false;
  return realOrSelf(a) === realOrSelf(b);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// 捕获配对码：auth.js 以 console.log('[Agent] 配对码: XXXX') 输出
let captured = '';
const realLog = console.log.bind(console);
console.log = (...args) => { captured += args.map(String).join(' ') + '\n'; };

const SESSION_A = 'smoke-sess-a';
const SESSION_B = 'smoke-sess-b';

let serverRef = null;

try {
  const { startServer } = await import('../../src/server.js');
  serverRef = startServer();

  // 等 listen + 配对码生成
  const deadline = Date.now() + 20000;
  let token = null;
  while (Date.now() < deadline && !token) {
    const m = captured.match(/配对码:\s*([A-Za-z0-9]+)/);
    if (m) {
      try {
        const r = await fetch(`${BASE}/api/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: m[1], extensionId: 'chrome-extension://smoke-session-workdir' })
        });
        const j = await r.json();
        if (j.success) token = j.token;
      } catch {
        // 端口尚未就绪，继续轮询
      }
    }
    if (!token) await new Promise((r) => setTimeout(r, 300));
  }
  if (!token) throw new Error('配对失败，未取得 token：' + captured.slice(-400));
  check('/api/pair 取得 token', true);

  /** 带认证的请求；sessionId / declaredWorkdir 对应扩展端两个头 */
  const api = (path, { body, method = 'POST', sessionId, declaredWorkdir } = {}) => {
    const headers = { Authorization: `Bearer ${token}`, 'Accept-Language': 'zh-CN' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (sessionId) headers['X-AIH-Session-Id'] = sessionId;
    if (declaredWorkdir) headers['X-AIH-Workdir'] = encodeURIComponent(declaredWorkdir);
    return fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  };
  const json = async (res) => ({ status: res.status, body: await res.json() });
  const bind = async (sessionId, workdir) => json(await api('/api/config/workdir', { body: { workdir, sessionId } }));
  const statusDetail = async (sessionId) => json(await api('/api/status/detail', { method: 'GET', sessionId }));
  /** 跑 pwd，返回 { status, body, stdout } */
  const pwd = async ({ sessionId, cwd, declaredWorkdir } = {}) => {
    const body = { command: 'pwd', wait: true };
    if (cwd !== undefined) body.cwd = cwd;
    return json(await api('/api/exec', { body, sessionId, declaredWorkdir }));
  };

  // ── 1) 绑定会话 A：只写注册表，不动全局 config ──
  const bindA = await bind(SESSION_A, DIR_A);
  check('绑定会话 A 返回 scope=session',
    bindA.status === 200 && bindA.body.success === true && bindA.body.scope === 'session',
    `status=${bindA.status}, scope=${bindA.body.scope}`);

  const diskConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  check('会话绑定不写全局 config.workdir',
    samePath(diskConfig.workdir, GLOBAL_WORKDIR), `disk.workdir=${diskConfig.workdir}`);
  check('会话绑定不改 allowedPaths（不给会话目录留永久授权）',
    !diskConfig.allowedPaths.some((p) => samePath(p, DIR_A)),
    `allowedPaths=${JSON.stringify(diskConfig.allowedPaths)}`);

  // ── 2) /api/status/detail 有/无会话头 ──
  const noSession = await statusDetail(null);
  check('无会话头：workdir === defaultWorkdir === 全局',
    noSession.body.workdir === noSession.body.defaultWorkdir && samePath(noSession.body.workdir, GLOBAL_WORKDIR),
    `workdir=${noSession.body.workdir}`);
  check('无会话头：scope=default 且支持特性探测',
    noSession.body.scope === 'default' && noSession.body.sessionWorkdirSupported === true);

  const detailA = await statusDetail(SESSION_A);
  check('会话头 A：workdir 为会话目录、defaultWorkdir 仍为全局',
    detailA.body.scope === 'session'
      && samePath(detailA.body.workdir, DIR_A)
      && samePath(detailA.body.defaultWorkdir, GLOBAL_WORKDIR),
    `workdir=${detailA.body.workdir}, default=${detailA.body.defaultWorkdir}`);
  check('会话头 A：回传 sessionWorkdir 供扩展端渲染绑定态',
    samePath(detailA.body.sessionWorkdir, DIR_A));

  // ── 3) /api/exec 的 cwd 语义 ──
  const execDefault = await pwd({ sessionId: SESSION_A });
  check('cwd 缺省：在会话目录执行',
    execDefault.status === 200 && samePath(execDefault.body.stdout.trim(), DIR_A),
    `stdout=${String(execDefault.body.stdout).trim()}`);

  const execRel = await pwd({ sessionId: SESSION_A, cwd: 'sub' });
  check('相对 cwd：按会话目录解析',
    execRel.status === 200 && samePath(execRel.body.stdout.trim(), join(DIR_A, 'sub')),
    `stdout=${String(execRel.body.stdout).trim()}`);

  const execAbsIn = await pwd({ sessionId: SESSION_A, cwd: join(DIR_A, 'sub') });
  check('会话目录内绝对 cwd：保留',
    execAbsIn.status === 200 && samePath(execAbsIn.body.stdout.trim(), join(DIR_A, 'sub')));

  const execOutside = await pwd({ sessionId: SESSION_A, cwd: '/etc' });
  check('越界 cwd 被 403，并回 hint 指回会话目录',
    execOutside.status === 403 && samePath(execOutside.body.hint, DIR_A),
    `status=${execOutside.status}, hint=${execOutside.body.hint}`);
  check('403 文案点明「本会话工作目录」便于模型自我纠正',
    typeof execOutside.body.error === 'string' && execOutside.body.error.includes('本会话'),
    String(execOutside.body.error).slice(0, 60));

  const execEscape = await pwd({ sessionId: SESSION_A, cwd: '../..' });
  check('相对逃逸（../..）被拒绝', execEscape.status === 403, `status=${execEscape.status}`);

  // 无会话头的越界：仍按全局默认判定（旧行为不变）
  const execNoSessionOutside = await pwd({ cwd: '/etc' });
  check('无会话头 + 越界 cwd：同样 403', execNoSessionOutside.status === 403);

  // ── 4) 跨会话隔离：改 B 不影响 A ──
  const bindB = await bind(SESSION_B, DIR_B);
  check('绑定会话 B 成功', bindB.status === 200 && bindB.body.scope === 'session');

  const execB = await pwd({ sessionId: SESSION_B });
  check('会话 B 在自己的目录执行',
    samePath(execB.body.stdout.trim(), DIR_B), `stdout=${String(execB.body.stdout).trim()}`);

  const execAAgain = await pwd({ sessionId: SESSION_A });
  check('改 B 后 A 的执行目录不变（执行期隔离）',
    samePath(execAAgain.body.stdout.trim(), DIR_A), `stdout=${String(execAAgain.body.stdout).trim()}`);

  // 跨会话借用：A 的请求显式指定 B 的目录必须被拒
  const crossBorrow = await pwd({ sessionId: SESSION_A, cwd: DIR_B });
  check('A 借用 B 的目录被拒（403）', crossBorrow.status === 403, `status=${crossBorrow.status}`);

  // ── 5) X-AIH-Workdir 采纳矩阵 ──
  const declaredOk = await pwd({ sessionId: SESSION_A, declaredWorkdir: DIR_A });
  check('X-AIH-Workdir 等于注册值：采纳（冻结值生效）',
    declaredOk.status === 200 && samePath(declaredOk.body.stdout.trim(), DIR_A));

  const declaredBogus = await pwd({ sessionId: SESSION_A, declaredWorkdir: '/etc' });
  check('X-AIH-Workdir 不等于注册值：忽略并回落注册值（不被头带偏）',
    declaredBogus.status === 200 && samePath(declaredBogus.body.stdout.trim(), DIR_A),
    `stdout=${String(declaredBogus.body.stdout).trim()}`);

  const declaredUnregistered = await pwd({ sessionId: 'smoke-sess-c', declaredWorkdir: GLOBAL_WORKDIR });
  check('未注册会话 + 头等于全局默认：采纳（语义等价）',
    declaredUnregistered.status === 200 && samePath(declaredUnregistered.body.stdout.trim(), GLOBAL_WORKDIR));

  const declaredUnregisteredBad = await pwd({ sessionId: 'smoke-sess-c', declaredWorkdir: DIR_A });
  check('未注册会话 + 头不等于全局默认：忽略',
    declaredUnregisteredBad.status === 200 && samePath(declaredUnregisteredBad.body.stdout.trim(), GLOBAL_WORKDIR));

  // ── 6) /api/fs/* 走会话上下文 ──
  const wf = await json(await api('/api/fs/write', { body: { path: 'marker-a.txt', content: 'hello-a' }, sessionId: SESSION_A }));
  check('fs/write 相对路径落会话目录',
    wf.status === 200 && samePath(wf.body.path, join(DIR_A, 'marker-a.txt')),
    `path=${wf.body.path}`);

  const lsA = await json(await api('/api/fs/list', { body: { path: '.' }, sessionId: SESSION_A }));
  check('fs/list 相对路径读会话目录，能看到刚写的文件',
    lsA.status === 200 && (lsA.body.entries || []).some((e) => e.name === 'marker-a.txt'),
    `path=${lsA.body.path}`);

  const lsBCross = await json(await api('/api/fs/list', { body: { path: DIR_A }, sessionId: SESSION_B }));
  check('B 读 A 的目录被拒（fs 路由同样按会话校验）', lsBCross.status === 403, `status=${lsBCross.status}`);

  // ── 7) unbind 后回落全局 ──
  const unbindA = await json(await api('/api/config/workdir/unbind', { body: { sessionId: SESSION_A } }));
  check('unbind 返回 scope=default',
    unbindA.status === 200 && unbindA.body.success === true && unbindA.body.scope === 'default',
    `removed=${unbindA.body.removed}`);

  const execAfterUnbind = await pwd({ sessionId: SESSION_A });
  check('unbind 后执行回到全局默认目录',
    samePath(execAfterUnbind.body.stdout.trim(), GLOBAL_WORKDIR),
    `stdout=${String(execAfterUnbind.body.stdout).trim()}`);

  const statusAfterUnbind = await statusDetail(SESSION_A);
  check('unbind 后 status/detail 回落 default 且 sessionWorkdir 为空',
    statusAfterUnbind.body.scope === 'default' && !statusAfterUnbind.body.sessionWorkdir);

  // ── 8) 工作目录目标边界：Agent 根目录拒、其下子目录放行 ──
  //  用户实测反馈：切回默认目录（Agent 下的 workspace）曾被误判为系统目录而 403
  const setDefaultAgain = await json(await api('/api/config/workdir', { body: { workdir: GLOBAL_WORKDIR } }));
  check('全局切换到 Agent 子目录（即默认 workspace）不被拦',
    setDefaultAgain.status === 200 && setDefaultAgain.body.success === true,
    `status=${setDefaultAgain.status}, error=${setDefaultAgain.body.error || ''}`);

  const setAgentRoot = await json(await api('/api/config/workdir', { body: { workdir: agentDir } }));
  check('全局切换到 Agent 根目录本身仍被 403',
    setAgentRoot.status === 403, `status=${setAgentRoot.status}`);

  // 判据与 checkPath 同源：绑定后必然全被拦的敏感子目录，设置时就该拒
  for (const name of ['logs', '.trash']) {
    const blocked = await json(await api('/api/config/workdir', { body: { workdir: join(agentDir, name) } }));
    check(`全局切换到硬阻止子目录 ${name} 被 403`,
      blocked.status === 403, `status=${blocked.status}`);
  }

  const bindSubdir = await bind(SESSION_A, GLOBAL_WORKDIR);
  check('会话级绑定同样允许 Agent 子目录',
    bindSubdir.status === 200 && bindSubdir.body.scope === 'session',
    `status=${bindSubdir.status}`);
  await api('/api/config/workdir/unbind', { body: { sessionId: SESSION_A } });

  const bindAgentRoot = await bind(SESSION_A, agentDir);
  check('会话级绑定 Agent 根目录被 403',
    bindAgentRoot.status === 403, `status=${bindAgentRoot.status}`);

  const bindLogs = await bind(SESSION_A, join(agentDir, 'logs'));
  check('会话级绑定硬阻止子目录同样被 403',
    bindLogs.status === 403, `status=${bindLogs.status}`);

  // ── 9) 非法 sessionId 不污染注册表 ──
  const badBind = await bind('has.dot', DIR_A);
  check('非法 sessionId 绑定被 400 拒绝（不静默降级成全局切换）',
    badBind.status === 400 && badBind.body.success === false, `status=${badBind.status}`);

  // ── 9b) 绑定意图显式化：scope 声明与实际参数不符必须报错 ──
  //  上层漏传 sessionId 时，旧规则会静默变成全局切换 → 把所有未绑定会话的目录一起改掉
  const scopeNoSid = await json(await api('/api/config/workdir', {
    body: { workdir: DIR_A, scope: 'session' },
  }));
  check('scope=session 但没 sessionId → 400（拒绝静默改全局）',
    scopeNoSid.status === 400, `status=${scopeNoSid.status}`);

  // 拼写/大小写错误不能被当成「没传 scope」而静默走全局切换
  const badScope = await json(await api('/api/config/workdir', {
    body: { workdir: DIR_A, scope: 'Session' },
  }));
  check('非法 scope 值 → 400（不静默降级成全局切换）',
    badScope.status === 400, `status=${badScope.status}`);

  // 断言「注册值原封不动」（此时 A 的注册值已被上一步改绑，不能写死 DIR_A）
  const beforeGlobal = await statusDetail(SESSION_A);
  const scopeGlobal = await json(await api('/api/config/workdir', {
    body: { workdir: GLOBAL_WORKDIR, scope: 'global', sessionId: SESSION_A },
  }));
  const afterGlobal = await statusDetail(SESSION_A);
  check('scope=global 时忽略 sessionId，不写会话注册表',
    scopeGlobal.status === 200 && scopeGlobal.body.scope !== 'session'
      && String(afterGlobal.body.sessionWorkdir || '') === String(beforeGlobal.body.sessionWorkdir || ''),
    `scope=${scopeGlobal.body.scope} before=${beforeGlobal.body.sessionWorkdir} after=${afterGlobal.body.sessionWorkdir}`);

  // ── 10) 全局 config 未被污染 ──
  const diskConfigFinal = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  check('整轮流程结束后全局 config 仍未被会话目录污染',
    samePath(diskConfigFinal.workdir, GLOBAL_WORKDIR)
      && !diskConfigFinal.allowedPaths.some((p) => samePath(p, DIR_A) || samePath(p, DIR_B)));
  // ── 11) 技能链路：命令 / 文件 / 搜索都按本会话目录（回归：曾用 process.cwd()、无 ctx） ──
  const probeSkill = 'smoke-cwd-probe';
  const impSkill = await json(await api('/api/skill/import', {
    body: {
      name: probeSkill,
      description: 'smoke probe',
      version: '1.0',
      type: 'workflow',
      steps: [{ id: 's1', tool: 'agent_exec', args: { command: 'pwd' } }],
    },
  }));
  check('导入探针技能', impSkill.status === 200 && impSkill.body.success === true,
    `status=${impSkill.status}, error=${impSkill.body.error || ''}`);

  await bind(SESSION_A, DIR_A);
  const skillRun = await json(await api('/api/skill/run', { body: { name: probeSkill }, sessionId: SESSION_A }));
  const pwdOut = String(skillRun.body?.results?.s1?.stdout || '').trim();
  check('技能里的 agent_exec 跑在本会话目录（不再用代理进程 cwd）',
    skillRun.body?.success === true && samePath(pwdOut, DIR_A),
    `pwd=${pwdOut}, err=${skillRun.body?.results?.s1?.error || skillRun.body?.error || ''}`);

  // 技能里的文件工具：相对路径同样按会话目录解析（会话目录刻意不在 allowedPaths 里）
  const probeReadSkill = 'smoke-read-probe';
  writeFileSync(join(DIR_A, 'probe.txt'), 'hello-from-a');
  await api('/api/skill/import', {
    body: {
      name: probeReadSkill,
      description: 'smoke probe',
      version: '1.0',
      type: 'workflow',
      steps: [{ id: 's1', tool: 'agent_file', args: { action: 'read', path: 'probe.txt' } }],
    },
  });
  const readRun = await json(await api('/api/skill/run', { body: { name: probeReadSkill }, sessionId: SESSION_A }));
  check('技能里的 agent_file 相对路径按会话目录解析',
    readRun.body?.results?.s1?.success === true && String(readRun.body?.results?.s1?.content || '').includes('hello-from-a'),
    `path=${readRun.body?.results?.s1?.path || ''}`);

  await api('/api/skill/delete', { body: { name: probeSkill } });
  await api('/api/skill/delete', { body: { name: probeReadSkill } });
  await api('/api/config/workdir/unbind', { body: { sessionId: SESSION_A } });

} catch (err) {
  check('冒烟执行', false, err.message);
} finally {
  try {
    if (serverRef?.server) serverRef.server.close();
    if (serverRef?.wss) serverRef.wss.close();
  } catch {
    // 忽略关闭噪音
  }
  try { rmSync(home, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const failed = results.filter((r) => !r.ok);
// console.log 在捕获配对码时被接管，失败明细必须走 realLog，否则只看得到一句汇总
if (failed.length) {
  realLog('\n失败明细：');
  for (const f of failed) realLog(`  ✗ ${f.name}${f.detail ? '  — ' + f.detail : ''}`);
}
realLog(`\n合计 ${results.length} 项，失败 ${failed.length} 项`);
process.exit(failed.length === 0 ? 0 : 1);
