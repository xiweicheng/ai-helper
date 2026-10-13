/**
 * memory-pushdown.smoke.mjs - 长期记忆逻辑下推 Agent 端 端到端冒烟
 *
 * 手动运行：node agent/test/smoke/memory-pushdown.smoke.mjs
 * （不纳入 `npm test`：不是 *.test.js）
 *
 * 隔离策略（不干扰用户正在运行的 agent）：
 * - 独立临时 HOME（agent 的 ~/.ai-helper-agent 数据目录随 homedir() 落到 tmp 内）
 * - 独立端口 18977（默认 18910 被用户已安装实例占用）
 * - 进程内直接 startServer()，不走 bin/agent.js 守护（避免写用户 config.json / pidfile）
 *
 * 链路：/api/pair 取 token → store(add) → recall → inject → manage(review) → 未知子路径 404
 *       → 压缩摘要沉淀（store summary/update + inject + recall）→ delete
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PORT = 18977;
const HOST = '127.0.0.1';

const home = mkdtempSync(join(tmpdir(), 'aihelper-mem-smoke-'));
const agentDir = join(home, '.ai-helper-agent');
mkdirSync(agentDir, { recursive: true });
writeFileSync(join(agentDir, 'config.json'), JSON.stringify({ port: PORT, host: HOST }, null, 2));

// 必须在导入 config.js/server.js 之前设置（config 模块在加载时用 homedir() 解析数据目录）
process.env.HOME = home;
process.env.AI_HELPER_LANG = 'zh';

const BASE = `http://${HOST}:${PORT}`;

// 捕获配对码：auth.js 以 console.log('[Agent] 配对码: XXXX') 输出
let captured = '';
const realLog = console.log.bind(console);
console.log = (...args) => { captured += args.map(String).join(' ') + '\n'; };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  realLog(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

let serverRef = null;
try {
  const { startServer } = await import('../../src/server.js');
  serverRef = startServer();

  // 等待 listen + 配对码生成
  const deadline = Date.now() + 15000;
  let token = null;
  while (Date.now() < deadline && !token) {
    const m = captured.match(/配对码:\s*([A-Za-z0-9]+)/);
    if (m) {
      try {
        const r = await fetch(`${BASE}/api/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: m[1], extensionId: 'chrome-extension://smoke-test' })
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

  const authed = (path, body) =>
    fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Accept-Language': 'zh-CN' },
      body: JSON.stringify(body)
    });

  // 1) store add（高重要性，供 inject 断言）
  const marker = `冒烟记忆-${Date.now()}`;
  const storeRes = await authed('/api/memory/store', { action: 'add', type: 'fact', content: marker, importance: 9, tags: ['smoke'] });
  const storeJson = await storeRes.json();
  check('POST /api/memory/store(add) 200 success', storeRes.status === 200 && storeJson.success === true, `id=${storeJson.memory?.id}`);
  const memoryId = storeJson.memory?.id;

  // 2) recall（含会话级去重）
  const recallRes = await authed('/api/memory/recall', { query: '冒烟记忆', sessionId: 'smoke-sess' });
  const recallJson = await recallRes.json();
  check('POST /api/memory/recall 命中写入的记忆', recallRes.status === 200 && recallJson.total >= 1, `total=${recallJson.total}`);
  const accessCount = (recallJson.results || []).find((m) => m.id === memoryId)?.accessCount;
  check('recall 响应仍为召回前副本（与原扩展端实现一致）', accessCount === 0, `accessCount=${accessCount}`);

  const recall2 = await authed('/api/memory/recall', { query: '冒烟记忆', sessionId: 'smoke-sess' });
  const recall2Json = await recall2.json();
  check('同会话二次召回带全旧提示', String(recall2Json.message || '').includes('已检索过'), String(recall2Json.message || '').slice(0, 60));

  // 3) inject（三级注入：importance 9 ≥ 8 应进 Tier1）
  const injectRes = await authed('/api/memory/inject', {});
  const injectJson = await injectRes.json();
  const injectedIds = (injectJson.injected || []).map((m) => m.id);
  check('POST /api/memory/inject 返回分级注入结果', injectRes.status === 200 && injectJson.success === true && injectedIds.includes(memoryId), `injected=${injectedIds.length}, remaining=${injectJson.remainingCount}`);

  // 4) manage review
  const manageRes = await authed('/api/memory/manage', { action: 'review' });
  const manageJson = await manageRes.json();
  check('POST /api/memory/manage(review) 返回 scored/candidates', manageRes.status === 200 && Array.isArray(manageJson.scored) && Array.isArray(manageJson.candidates), `scored=${(manageJson.scored || []).length}`);

  // 5) 数据落盘位置：临时 HOME 内的 memory 文件（确证"逻辑与数据同侧"）
  const disk = JSON.parse(await (await import('fs/promises')).readFile(join(agentDir, 'memory', 'global-memory.json'), 'utf8'));
  const diskFact = disk.facts.find((f) => f.id === memoryId);
  check('数据文件写在 agent 数据目录内', Boolean(diskFact), disk.facts.length + ' facts');
  check('召回计数已落盘', (diskFact?.accessCount || 0) >= 1 && Boolean(diskFact?.lastAccessAt), `accessCount=${diskFact?.accessCount}`);

  // 6) 业务失败 → 400（扩展端据 httpStatus 区分）
  const badRes = await authed('/api/memory/store', { action: 'add', content: 'x' });
  const badJson = await badRes.json();
  check('缺 type 时 400 + 本地化错误文案', badRes.status === 400 && badJson.success === false, badJson.error);

  // 7) 未知子路径 → 404（旧版 agent 探测契约的镜像）
  const nopeRes = await authed('/api/memory/nope', {});
  check('未知记忆子路径 404', nopeRes.status === 404);

  // 8) 压缩摘要沉淀链路（会话压缩 → type=summary → 按需召回 → 同 id 复压缩去重）
  //    口径以 injection.js 实际行为为准：summaries 永不进常驻注入，只计入 remainingCount/remainingTags
  const sumAddRes = await authed('/api/memory/store', {
    action: 'add',
    type: 'summary',
    category: 'decision',
    content: '[会话压缩摘要 r1 · 已压缩 12 条]\n冒烟压缩摘要',
    title: '会话摘要 smoke',
    tags: ['compaction', 'session:smoke-sess'],
    importance: 6,
    sourceSessionId: 'smoke-sess',
  });
  const sumAdd = await sumAddRes.json();
  const summaryId = sumAdd.memory?.id;
  check('store(add) type=summary 进 summaries（id 前缀 sum_）',
    sumAddRes.status === 200 && sumAdd.success === true && String(summaryId).startsWith('sum_') && sumAdd.memory.type === 'summary',
    'id=' + summaryId);

  const injectSum = await (await authed('/api/memory/inject', {})).json();
  check('摘要不进常驻注入，转按需召回（remainingCount/remainingTags 可见）',
    !(injectSum.injected || []).some((m) => m.id === summaryId)
      && injectSum.remainingCount === 1
      && (injectSum.remainingTags || []).includes('compaction'),
    'remaining=' + injectSum.remainingCount + ', tags=' + JSON.stringify(injectSum.remainingTags));

  const sumRecall = await (await authed('/api/memory/recall', { query: '冒烟压缩摘要', tags: ['compaction'], sessionId: 'other-sess' })).json();
  check('跨会话按 compaction 标签可召回该摘要',
    sumRecall.success === true && (sumRecall.results || []).some((m) => m.id === summaryId),
    'total=' + sumRecall.total);

  const sumUpdRes = await authed('/api/memory/store', {
    action: 'update',
    memoryId: summaryId,
    type: 'summary',
    content: '[会话压缩摘要 r2 · 已压缩 20 条]\n冒烟压缩摘要 v2',
    importance: 6,
  });
  const sumUpd = await sumUpdRes.json();
  const diskAfterUpdate = JSON.parse(await (await import('fs/promises')).readFile(join(agentDir, 'memory', 'global-memory.json'), 'utf8'));
  check('同 memoryId 重复沉淀走 update（summaries 仍 1 条且内容已替换）',
    sumUpd.success === true && sumUpd.action === 'updated'
      && diskAfterUpdate.summaries.length === 1
      && String(diskAfterUpdate.summaries[0].content).includes('r2'),
    'summaries=' + diskAfterUpdate.summaries.length);

  // 9) 清理：删除冒烟记忆后确认注入不再包含
  const delRes = await authed('/api/memory/store', { action: 'delete', memoryId });
  const delJson = await delRes.json();
  const injectAfter = await (await authed('/api/memory/inject', {})).json();
  check('delete 后注入结果不再包含该记忆', delJson.success === true && !(injectAfter.injected || []).some((m) => m.id === memoryId));
} catch (err) {
  check('冒烟执行', false, err.message);
} finally {
  try {
    if (serverRef && typeof serverRef.close === 'function') serverRef.close();
  } catch {
    // 忽略关闭噪音
  }
  rmSync(home, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
realLog(`\n合计 ${results.length} 项，失败 ${failed.length} 项`);
process.exit(failed.length === 0 ? 0 : 1);
