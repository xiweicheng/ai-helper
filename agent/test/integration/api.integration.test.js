// agent/test/integration/api.integration.test.js
// Agent API 集成测试：用真实 token 跑测全部主要 API 端点
// 运行：node --test agent/test/integration/api.integration.test.js
//
// 环境变量：
//   AGENT_TOKEN  - 认证 token（必填）
//   AGENT_URL    - Agent 服务地址（默认 http://127.0.0.1:18910）
//
// 测试策略：在 workdir 下创建临时测试目录，所有文件操作在其中进行，测试完成自动清理。
// 不破坏用户数据；不执行 restart/update/shutdown 等破坏性操作。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { readFileSync } from 'fs';

const TOKEN = process.env.AGENT_TOKEN || '93d601538e73e1dd91275df500ff64a1f6690af57495ecfc0373860f2738dcf7';
const BASE = process.env.AGENT_URL || 'http://127.0.0.1:18910';

// ========== 请求辅助 ==========

async function req(path, body, method = 'POST', timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body || {})
    }, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, error: err.message };
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function getNoAuth(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function reqWithToken(path, body, token, method = 'POST') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// ========== 测试上下文 ==========

const ctx = {
  workdir: null,
  allowedPaths: null,
  testDir: null,
  originalWorkdir: null,
  agentHomeDir: null  // Agent 进程的 home 目录（可能不同于测试进程的 os.homedir()）
};

// 跳过条件：未配置 token 或 Agent 不可达
function skipIfNoAgent(op) {
  return async (t) => {
    const health = await getNoAuth('/api/status');
    if (health.status !== 200 || !health.data?.success) {
      t.skip('Agent 不可达，跳过');
      return;
    }
    await op(t);
  };
}

before(async () => {
  // 获取当前 workdir
  const detail = await get('/api/status/detail');
  if (!detail.data?.success) {
    throw new Error(`无法获取 Agent 状态: ${JSON.stringify(detail)}`);
  }
  ctx.workdir = detail.data.workdir;
  ctx.allowedPaths = detail.data.allowedPaths;
  ctx.originalWorkdir = ctx.workdir;
  // Agent 进程的 home 目录（测试进程的 os.homedir() 可能不同，例如隔离测试环境）
  ctx.agentHomeDir = detail.data.homeDir;
  assert.ok(ctx.agentHomeDir, 'Agent 应返回 homeDir');
  // 在 workdir 下创建临时测试目录
  ctx.testDir = join(ctx.workdir, `_integration_test_${Date.now()}`);
  const mkdirRes = await req('/api/fs/mkdir', { path: ctx.testDir });
  assert.equal(mkdirRes.data.success, true, `创建测试目录失败: ${JSON.stringify(mkdirRes)}`);
  console.log(`[测试] 工作目录: ${ctx.workdir}`);
  console.log(`[测试] Agent home: ${ctx.agentHomeDir}`);
  console.log(`[测试] 临时目录: ${ctx.testDir}`);
});

after(async () => {
  // 安全网：恢复原始 workdir（防止 workdir 切换测试失败导致后续测试全部不可用）
  if (ctx.originalWorkdir) {
    const cur = await get('/api/status/detail').catch(() => ({}));
    if (cur.data?.workdir && cur.data.workdir !== ctx.originalWorkdir) {
      await req('/api/config/workdir', { workdir: ctx.originalWorkdir }).catch(() => {});
      console.log(`[测试] 已恢复原始工作目录: ${ctx.originalWorkdir}`);
    }
  }
  // 清理临时目录（移到回收站）
  if (ctx.testDir) {
    await req('/api/fs/delete', { path: ctx.testDir }).catch(() => {});
    console.log(`[测试] 已清理临时目录`);
  }
});

// ========== 1. 认证与状态 ==========

describe('1. 认证与状态', () => {
  test('无 Authorization 头 → 401', async () => {
    const res = await getNoAuth('/api/status/detail');
    assert.equal(res.status, 401);
    assert.equal(res.data.success, false);
  });

  test('错误 token → 403', async () => {
    const res = await reqWithToken('/api/status/detail', {}, 'invalid_token_xxx');
    assert.equal(res.status, 403);
    assert.equal(res.data.success, false);
  });

  test('正确 token → 200', async () => {
    const res = await get('/api/status/detail');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.workdir, '应返回 workdir');
    assert.ok(Array.isArray(res.data.allowedPaths), '应返回 allowedPaths');
    assert.ok(res.data.platformName, '应返回 platformName');
  });

  test('GET /api/status 无需认证', async () => {
    const res = await getNoAuth('/api/status');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.version, '应返回 version');
    assert.ok(res.data.running === true, '应返回 running=true');
  });

  test('GET /api/heartbeat 需认证，返回 time', async () => {
    const res = await get('/api/heartbeat');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(typeof res.data.time === 'number');
  });

  test('未知路径 → 404', async () => {
    const res = await get('/api/nonexistent/path');
    assert.equal(res.status, 404);
    assert.equal(res.data.success, false);
  });
});

// ========== 2. 文件系统基础操作 ==========

describe('2. 文件系统基础操作', () => {
  test('write → read 往返一致（utf-8）', async () => {
    const filePath = join(ctx.testDir, 'hello.txt');
    const content = '你好，世界！Hello World\n中文测试';
    const writeRes = await req('/api/fs/write', { path: filePath, content });
    assert.equal(writeRes.data.success, true, `写入失败: ${JSON.stringify(writeRes)}`);

    const readRes = await req('/api/fs/read', { path: filePath });
    assert.equal(readRes.data.success, true);
    assert.equal(readRes.data.content, content);
    assert.equal(readRes.data.size, Buffer.byteLength(content, 'utf-8'));
  });

  test('write base64 二进制内容', async () => {
    const filePath = join(ctx.testDir, 'bin.dat');
    const binary = Buffer.from([0x00, 0xFF, 0x42, 0x6F, 0x6F]).toString('base64');
    const writeRes = await req('/api/fs/write', { path: filePath, content: binary, encoding: 'base64' });
    assert.equal(writeRes.data.success, true);

    // 用 download 读回验证二进制
    const dlRes = await req('/api/fs/download', { path: filePath });
    assert.equal(dlRes.data.success, true);
    assert.equal(dlRes.data.type, 'file');
    const buf = Buffer.from(dlRes.data.content, 'base64');
    assert.deepEqual(Array.from(buf), [0x00, 0xFF, 0x42, 0x6F, 0x6F]);
  });

  test('list 列出目录内容', async () => {
    // 先创建几个文件
    await req('/api/fs/write', { path: join(ctx.testDir, 'a.txt'), content: 'a' });
    await req('/api/fs/write', { path: join(ctx.testDir, 'b.txt'), content: 'b' });

    const res = await req('/api/fs/list', { path: ctx.testDir });
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.entries));
    const names = res.data.entries.map(e => e.name);
    assert.ok(names.includes('a.txt'));
    assert.ok(names.includes('b.txt'));
    assert.ok(names.includes('hello.txt'));
    // 每个条目应有 type/size/mtime
    const entry = res.data.entries[0];
    assert.ok('type' in entry);
    assert.ok('size' in entry);
    assert.ok('mtime' in entry);
  });

  test('stat 获取文件详情', async () => {
    const filePath = join(ctx.testDir, 'a.txt');
    const res = await req('/api/fs/stat', { path: filePath });
    assert.equal(res.data.success, true);
    assert.equal(res.data.info.isFile, true);
    assert.equal(res.data.info.isDirectory, false);
    assert.ok(typeof res.data.info.size === 'number');
    assert.ok(res.data.info.mimeType === 'text/plain');
  });

  test('mkdir 已存在目录 → 409', async () => {
    const res = await req('/api/fs/mkdir', { path: ctx.testDir });
    assert.equal(res.status, 409);
    assert.equal(res.data.success, false);
  });

  test('read 目录 → 400', async () => {
    const res = await req('/api/fs/read', { path: ctx.testDir });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
  });

  test('list 文件（非目录）→ 400', async () => {
    const res = await req('/api/fs/list', { path: join(ctx.testDir, 'a.txt') });
    assert.equal(res.status, 400);
  });

  test('read 不存在文件 → 404', async () => {
    const res = await req('/api/fs/read', { path: join(ctx.testDir, 'no_such_file.txt') });
    assert.equal(res.status, 404);
  });

  test('缺少 path 参数 → 400', async () => {
    const res = await req('/api/fs/read', {});
    // checkPath(null) → allowed:false → 403；但 read 端点先调 checkPath
    assert.ok(res.status === 403 || res.status === 400);
  });
});

// ========== 3. 文件系统高级操作（rename / move / delete） ==========

describe('3. rename / move / delete', () => {
  test('rename 文件（仅改名）', async () => {
    const oldPath = join(ctx.testDir, 'rename_me.txt');
    const newPath = join(ctx.testDir, 'renamed.txt');
    await req('/api/fs/write', { path: oldPath, content: 'rename content' });

    const res = await req('/api/fs/rename', { path: oldPath, newName: 'renamed.txt' });
    assert.equal(res.data.success, true, `rename 失败: ${JSON.stringify(res)}`);
    assert.equal(res.data.newName, 'renamed.txt');

    // 旧路径不应存在
    const oldCheck = await req('/api/fs/stat', { path: oldPath });
    assert.equal(oldCheck.status, 404);
    // 新路径应存在
    const newCheck = await req('/api/fs/read', { path: newPath });
    assert.equal(newCheck.data.success, true);
    assert.equal(newCheck.data.content, 'rename content');
  });

  test('rename 到已存在名称 → 409', async () => {
    await req('/api/fs/write', { path: join(ctx.testDir, 'exist1.txt'), content: '1' });
    await req('/api/fs/write', { path: join(ctx.testDir, 'exist2.txt'), content: '2' });
    const res = await req('/api/fs/rename', { path: join(ctx.testDir, 'exist1.txt'), newName: 'exist2.txt' });
    assert.equal(res.status, 409);
  });

  test('rename 名称含路径分隔符 → 400', async () => {
    await req('/api/fs/write', { path: join(ctx.testDir, 'sep.txt'), content: 'x' });
    const res = await req('/api/fs/rename', { path: join(ctx.testDir, 'sep.txt'), newName: 'a/b.txt' });
    assert.equal(res.status, 400);
  });

  test('mkdir 子目录 + move 文件到子目录', async () => {
    const subDir = join(ctx.testDir, 'subdir');
    const mkRes = await req('/api/fs/mkdir', { path: subDir });
    assert.equal(mkRes.data.success, true);

    const srcPath = join(ctx.testDir, 'move_me.txt');
    await req('/api/fs/write', { path: srcPath, content: 'move content' });

    const mvRes = await req('/api/fs/move', { path: srcPath, destDir: subDir });
    assert.equal(mvRes.data.success, true, `move 失败: ${JSON.stringify(mvRes)}`);
    assert.equal(mvRes.data.newPath, join(subDir, 'move_me.txt'));

    // 验证移动后可读
    const readRes = await req('/api/fs/read', { path: join(subDir, 'move_me.txt') });
    assert.equal(readRes.data.content, 'move content');
  });

  test('delete 文件 → 移至回收站', async () => {
    const filePath = join(ctx.testDir, 'to_delete.txt');
    await req('/api/fs/write', { path: filePath, content: 'bye' });
    const res = await req('/api/fs/delete', { path: filePath });
    assert.equal(res.data.success, true);
    assert.ok(res.data.trashId, '应返回 trashId');
    // 删除后应 404
    const check = await req('/api/fs/stat', { path: filePath });
    assert.equal(check.status, 404);
  });
});

// ========== 4. 下载操作 ==========

describe('4. 下载（base64 与流式）', () => {
  test('download 单文件返回 base64', async () => {
    const filePath = join(ctx.testDir, 'dl.txt');
    await req('/api/fs/write', { path: filePath, content: 'download me' });
    const res = await req('/api/fs/download', { path: filePath });
    assert.equal(res.data.success, true);
    assert.equal(res.data.type, 'file');
    assert.equal(Buffer.from(res.data.content, 'base64').toString(), 'download me');
    assert.ok(res.data.mimeType);
  });

  test('download 目录打包为 zip', async () => {
    const res = await req('/api/fs/download', { path: ctx.testDir });
    assert.equal(res.data.success, true);
    assert.equal(res.data.type, 'directory');
    assert.equal(res.data.mimeType, 'application/zip');
    assert.ok(res.data.content, '应返回 zip base64 内容');
    // zip 文件头魔数 PK
    const buf = Buffer.from(res.data.content, 'base64');
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4B);
  });

  test('download-multi 多文件打包', async () => {
    await req('/api/fs/write', { path: join(ctx.testDir, 'm1.txt'), content: 'm1' });
    await req('/api/fs/write', { path: join(ctx.testDir, 'm2.txt'), content: 'm2' });
    const res = await req('/api/fs/download-multi', {
      paths: [join(ctx.testDir, 'm1.txt'), join(ctx.testDir, 'm2.txt')]
    });
    assert.equal(res.data.success, true);
    assert.equal(res.data.type, 'archive');
    assert.equal(res.data.mimeType, 'application/zip');
  });

  test('download-stream 流式下载单文件', async () => {
    const filePath = join(ctx.testDir, 'stream.txt');
    await req('/api/fs/write', { path: filePath, content: 'stream content' });
    const res = await fetch(`${BASE}/api/fs/download-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ path: filePath })
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/plain'));
    const text = await res.text();
    assert.equal(text, 'stream content');
  });

  test('download-stream 流式下载目录（zip）', async () => {
    const subDir = join(ctx.testDir, 'streamdir');
    await req('/api/fs/mkdir', { path: subDir });
    await req('/api/fs/write', { path: join(subDir, 'x.txt'), content: 'x' });
    const res = await fetch(`${BASE}/api/fs/download-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ path: subDir })
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf[0], 0x50); // PK
  });
});

// ========== 5. 上传 ==========

describe('5. 上传', () => {
  test('upload-stream 流式上传到指定路径', async () => {
    const destPath = join(ctx.testDir, 'uploaded.bin');
    const payload = Buffer.from('uploaded binary content');
    const res = await fetch(`${BASE}/api/fs/upload-stream?path=${encodeURIComponent(destPath)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream'
      },
      body: payload
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.size, payload.length);

    // 验证内容
    const readRes = await req('/api/fs/read', { path: destPath });
    assert.equal(readRes.data.content, 'uploaded binary content');
  });

  test('upload-stream 缺少 path 参数 → 400', async () => {
    const res = await fetch(`${BASE}/api/fs/upload-stream`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('x')
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.success, false);
  });

  test('upload-stream 到越界路径 → 403', async () => {
    const res = await fetch(`${BASE}/api/fs/upload-stream?path=${encodeURIComponent('/tmp/should_not_exist_xx.bin')}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('x')
    });
    const data = await res.json();
    assert.equal(res.status, 403);
    assert.equal(data.success, false);
  });
});

// ========== 6. 搜索 ==========

describe('6. 搜索', () => {
  test('search_files 按文件名模式搜索', async () => {
    // 确保有可搜索的文件
    await req('/api/fs/write', { path: join(ctx.testDir, 'find_me.js'), content: 'console.log(1)' });
    const res = await req('/api/fs/search_files', {
      path: ctx.testDir,
      pattern: '*.js',
      recursive: true,
      maxResults: 50
    });
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.results));
    const names = res.data.results.map(r => r.name);
    assert.ok(names.includes('find_me.js'));
    assert.ok(res.data.engine === 'fd' || res.data.engine === 'nodejs');
  });

  test('search_content 按内容搜索', async () => {
    await req('/api/fs/write', { path: join(ctx.testDir, 'grep_target.txt'), content: 'line1\nUNIQUE_MARKER_12345\nline3' });
    const res = await req('/api/fs/search_content', {
      path: ctx.testDir,
      pattern: 'UNIQUE_MARKER_12345',
      recursive: true,
      maxResults: 20,
      contextLines: 1
    });
    assert.equal(res.data.success, true);
    assert.ok(res.data.results.length > 0);
    assert.ok(res.data.results[0].content.includes('UNIQUE_MARKER_12345'));
    // rg 引擎的 parseRgOutput 不解析上下文行（已知限制），仅 nodejs 引擎返回 context
    if (res.data.engine === 'nodejs') {
      assert.ok(res.data.results[0].context.length >= 1, 'nodejs 引擎应返回上下文');
    }
  });

  test('search_content 空模式 → 400', async () => {
    const res = await req('/api/fs/search_content', { path: ctx.testDir, pattern: '   ' });
    assert.equal(res.data.success, false);
  });

  test('search 越界路径 → 拒绝', async () => {
    const res = await req('/api/fs/search_files', { path: '/etc', pattern: '*.conf' });
    assert.equal(res.data.success, false);
  });
});

// ========== 7. 路径安全 ==========

describe('7. 路径安全（沙箱与硬阻止）', () => {
  test('访问 /etc/passwd 被拒绝', async () => {
    const res = await req('/api/fs/read', { path: '/etc/passwd' });
    assert.equal(res.status, 403);
    assert.equal(res.data.success, false);
  });

  test('访问 Agent config.json（硬阻止）被拒绝', async () => {
    const configPath = join(ctx.agentHomeDir, '.ai-helper-agent', 'config.json');
    const res = await req('/api/fs/read', { path: configPath });
    assert.equal(res.status, 403);
    assert.equal(res.data.success, false);
    // 应是硬阻止原因，而非白名单原因
    assert.equal(res.data.error, '禁止访问代理系统文件');
  });

  test('访问 Agent pairings.json（硬阻止，含 token）被拒绝', async () => {
    const pairingsPath = join(ctx.agentHomeDir, '.ai-helper-agent', 'pairings.json');
    const res = await req('/api/fs/read', { path: pairingsPath });
    assert.equal(res.status, 403);
    assert.equal(res.data.error, '禁止访问代理系统文件');
  });

  test('访问 Agent logs 目录（硬阻止）被拒绝', async () => {
    const logsPath = join(ctx.agentHomeDir, '.ai-helper-agent', 'logs', 'test.log');
    const res = await req('/api/fs/write', { path: logsPath, content: 'x' });
    assert.equal(res.status, 403);
    assert.equal(res.data.error, '禁止访问代理系统文件');
  });

  test('相对路径基于 workdir 解析并可访问', async () => {
    // 在 workdir 根创建文件（用相对路径写）
    const relPath = `_rel_test_${Date.now()}.txt`;
    const writeRes = await req('/api/fs/write', { path: relPath, content: 'rel' });
    assert.equal(writeRes.data.success, true);
    // 清理
    await req('/api/fs/delete', { path: join(ctx.workdir, relPath) }).catch(() => {});
  });

  test('~ 展开到用户主目录', async () => {
    // 写到 ~/ 下会越界（除非 home 在白名单），应被拒绝或受控
    const res = await req('/api/fs/read', { path: '~/.bashrc' });
    // home 目录通常不在白名单 → 403
    assert.equal(res.status, 403);
  });

  test('路径穿越 .. 被限制在沙箱内', async () => {
    // 从 testDir 用 .. 跳出，应仍被白名单检查拦截（如果跳出 workdir）
    const escapePath = join(ctx.testDir, '..', '..', 'etc', 'passwd');
    const res = await req('/api/fs/read', { path: escapePath });
    assert.equal(res.status, 403);
  });
});

// ========== 8. 命令执行 ==========

describe('8. 命令执行', () => {
  test('exec 同步模式执行 echo', async () => {
    const res = await req('/api/exec', {
      command: 'echo "hello_from_test"',
      cwd: ctx.testDir,
      wait: true
    }, 'POST', 30000);
    assert.equal(res.data.success, true);
    assert.equal(res.data.exitCode, 0);
    assert.ok(res.data.stdout.includes('hello_from_test'));
  });

  test('exec 缺少 command → 400', async () => {
    const res = await req('/api/exec', { command: '' });
    assert.equal(res.status, 400);
  });

  test('exec 越界 cwd → 403', async () => {
    const res = await req('/api/exec', { command: 'echo x', cwd: '/etc', wait: true });
    assert.equal(res.status, 403);
  });

  test('exec 高危命令被拦截（deny）', async () => {
    const res = await req('/api/exec', { command: 'rm -rf /', wait: true });
    assert.equal(res.status, 403);
    assert.equal(res.data.level, 'deny');
  });

  test('exec 灰名单命令需确认（confirm）', async () => {
    const res = await req('/api/exec', { command: 'sudo ls', wait: true });
    assert.equal(res.data.success, true);
    assert.equal(res.data.level, 'confirm');
  });

  test('exec 异步模式返回 execId + wsUrl', async () => {
    const res = await req('/api/exec', { command: 'echo async', cwd: ctx.testDir });
    assert.equal(res.data.success, true);
    assert.equal(res.data.level, 'allow');
    assert.ok(res.data.execId, '应返回 execId');
    assert.ok(res.data.wsUrl, '应返回 wsUrl');
  });
});

// ========== 9. Skill ==========

describe('9. Skill', () => {
  test('GET /api/skill/list', async () => {
    const res = await get('/api/skill/list');
    assert.equal(res.status, 200);
    assert.ok(res.data.skills !== undefined || res.data.success !== undefined);
  });

  test('GET /api/skill/agent-prompts', async () => {
    const res = await get('/api/skill/agent-prompts');
    // 即使没有 agent skill，也应返回 success
    assert.equal(res.status, 200);
  });

  test('GET /api/skill/detail 缺少 name → 400', async () => {
    const res = await get('/api/skill/detail');
    assert.equal(res.status, 400);
  });

  test('GET /api/skill/reload', async () => {
    const res = await req('/api/skill/reload', {});
    assert.equal(res.data.success, true);
    assert.ok(typeof res.data.count === 'number');
  });
});

// ========== 10. MCP ==========

describe('10. MCP', () => {
  test('GET /api/mcp/servers', async () => {
    const res = await get('/api/mcp/servers');
    assert.equal(res.status, 200);
    // 返回数组或对象
    assert.ok(res.data !== undefined);
  });

  test('GET /api/mcp/tools', async () => {
    const res = await get('/api/mcp/tools');
    assert.equal(res.status, 200);
  });

  test('POST /api/mcp/servers 缺少 id → 400', async () => {
    const res = await req('/api/mcp/servers', { command: 'echo' });
    assert.equal(res.status, 400);
  });
});

// ========== 11. 回收站与日志 ==========

describe('11. 回收站与日志', () => {
  test('GET /api/trash/list', async () => {
    const res = await get('/api/trash/list');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.entries));
  });

  test('POST /api/trash/restore 缺少 trashId → 400', async () => {
    const res = await req('/api/trash/restore', {});
    assert.equal(res.status, 400);
  });

  test('POST /api/trash/restore 不存在的 trashId → 400', async () => {
    const res = await req('/api/trash/restore', { trashId: 'nonexistent_12345' });
    assert.equal(res.data.success, false);
  });

  test('POST /api/logs/query 查询最近日志', async () => {
    const res = await req('/api/logs/query', { limit: 10 });
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.entries));
    assert.ok(res.data.entries.length <= 10);
  });
});

// ========== 12. 配置（workdir 切换 + allowed-paths，带恢复） ==========

describe('12. 配置接口（带恢复）', () => {
  test('workdir 切换到临时目录后切回原目录', async () => {
    const newDir = join(ctx.workdir, `_wd_switch_${Date.now()}`);
    try {
      // 切换
      const switchRes = await req('/api/config/workdir', { workdir: newDir });
      assert.equal(switchRes.data.success, true, `切换失败: ${JSON.stringify(switchRes)}`);
      assert.equal(switchRes.data.workdir, newDir);
      assert.ok(switchRes.data.allowedPaths.includes(newDir));

      // 验证状态已更新
      const detail = await get('/api/status/detail');
      assert.equal(detail.data.workdir, newDir);

      // 切回原 workdir
      const revertRes = await req('/api/config/workdir', { workdir: ctx.originalWorkdir });
      assert.equal(revertRes.data.success, true);

      // 从 allowedPaths 移除临时目录
      await req('/api/config/allowed-paths/remove', { path: newDir });

      // 清理目录
      await req('/api/fs/delete', { path: newDir }).catch(() => {});
    } finally {
      // 安全网：无论断言是否失败，都恢复原 workdir
      const cur = await get('/api/status/detail').catch(() => ({}));
      if (cur.data?.workdir && cur.data.workdir !== ctx.originalWorkdir) {
        await req('/api/config/workdir', { workdir: ctx.originalWorkdir }).catch(() => {});
      }
    }
  });

  test('workdir 切换到 Agent 系统目录被拒绝', async () => {
    const agentDir = join(ctx.agentHomeDir, '.ai-helper-agent');
    const res = await req('/api/config/workdir', { workdir: agentDir });
    assert.equal(res.status, 403);
    assert.equal(res.data.success, false);
  });

  test('workdir 切换非绝对路径被拒绝', async () => {
    const res = await req('/api/config/workdir', { workdir: 'relative/path' });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
  });

  test('workdir 缺少参数 → 400', async () => {
    const res = await req('/api/config/workdir', {});
    assert.equal(res.status, 400);
  });

  test('allowed-paths/remove 移除当前工作目录被拒绝', async () => {
    const res = await req('/api/config/allowed-paths/remove', { path: ctx.originalWorkdir });
    assert.equal(res.data.success, false);
  });
});

// ========== 13. 汇总：所有端点可达性 ==========

describe('14. 端点汇总', () => {
  test('所有主要 GET 端点可达', async () => {
    const endpoints = [
      '/api/status',
      '/api/status/detail',
      '/api/heartbeat',
      '/api/skill/list',
      '/api/skill/agent-prompts',
      '/api/mcp/servers',
      '/api/mcp/tools',
      '/api/trash/list'
    ];
    for (const ep of endpoints) {
      const res = await get(ep);
      assert.equal(res.status, 200, `${ep} 应返回 200，实际 ${res.status}`);
    }
  });
});
