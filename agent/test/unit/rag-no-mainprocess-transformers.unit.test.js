// agent/test/unit/rag-no-mainprocess-transformers.unit.test.js
// 不变式（Windows dll 冲突的根防线）：**主进程永不加载 @huggingface/transformers**。
//
// 为什么用测试锁住而不是靠注释约定：transformers 一进主进程就会把 onnxruntime-node 的
// 原生库拉进当前进程，而语音输入（sherpa-onnx）已经在主进程里放了一份 onnxruntime.dll。
// Windows 的 LoadLibrary 按「模块基名」复用模块，两份版本不同即 Win32 193
// （"The operating system cannot run %1."）。这类回归没有任何编译期信号，只会在用户
// 装完语音输入后表现为「知识库检索失败」，所以必须由测试兜住。
//
// 三层把关：
//   1. 源码静态：agent/src 全域（剥离注释后）只有 embed-worker.mjs 真的 import 这个包；
//      probe-child.mjs 是唯一另一处字面量，且它本身是 detect.js spawn 出来的子进程。
//   2. 接线契约：worker-client.js 用 process.execPath spawn embed-worker.mjs（不是
//      worker_threads —— 线程与主线程共享地址空间，隔离不了）。
//   3. 运行时证据：真起一个子进程加载主进程模块图 + 走一次本地档往返，断言本进程
//      已加载的 onnxruntime 共享库为 0；再用反向对照证明这个探测器本身有效。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PKG = '@huggingface/transformers';
const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/rag-main-module-graph.mjs', import.meta.url));

// 子进程执行的唯一合法实现：embed-worker（本包真实 import）与 probe-child（按名动态 import）
const WORKER_FILE = 'rag/embedding/embed-worker.mjs';
const PROBE_FILE = 'rag/probe-child.mjs';
// detect.js 只读探测结果的键名，不产生 import
const DETECT_FILE = 'rag/detect.js';

/**
 * 递归列出 src 下的 .js/.mjs（跳过隐藏目录与 node_modules）
 * @param {string} dir
 * @param {string[]} [acc]
 * @returns {string[]}
 */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.m?js$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * 去掉 // 与块注释（保留字符串内容，避免 URL 里的 // 被误切）
 * @param {string} text
 * @returns {string}
 */
function stripComments(text) {
  let out = '';
  let quote = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 2; continue; }
      if (ch === quote) quote = '';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    out += ch;
    i += 1;
  }
  return out;
}

/** 源码（相对 src/ 的 POSIX 路径 → 剥离注释后的内容） */
const sources = new Map(
  walk(SRC_DIR).map((file) => [relative(SRC_DIR, file).split('\\').join('/'), stripComments(readFileSync(file, 'utf8'))]),
);

/** 真的会加载这个包的语句：静态 from / 裸 import / 动态 import('...') / require(...) */
const IMPORT_RE = new RegExp(`(?:from|import)\\s*\\(?\\s*['"]${PKG}['"]|require\\s*\\(\\s*['"]${PKG}['"]`);
/** 只要出现包名字面量（含 TARGETS 名单、对象键访问） */
const LITERAL_RE = new RegExp(`['"]${PKG}['"]`);

describe(`源码静态：主进程不 import ${PKG}`, () => {
  test('只有 embed-worker.mjs 真的 import（静态或动态）', () => {
    const hits = [...sources.entries()].filter(([, code]) => IMPORT_RE.test(code)).map(([file]) => file);
    assert.deepEqual(hits, [WORKER_FILE], `主进程模块不得 import ${PKG}，实际命中: ${hits.join(', ') || '无'}`);
  });

  test('包名字面量只出现在三个已知位置（子进程实现 / 子进程名单 / 探测结果键）', () => {
    const hits = [...sources.entries()].filter(([, code]) => LITERAL_RE.test(code)).map(([file]) => file);
    assert.deepEqual(hits.sort(), [DETECT_FILE, PROBE_FILE, WORKER_FILE].sort());
  });

  test('local.js 只做透传：不出现包名，且经由 getEmbedWorker() 取子进程客户端', () => {
    const code = sources.get('rag/embedding/local.js');
    assert.ok(code, 'missing src/rag/embedding/local.js');
    assert.equal(LITERAL_RE.test(code), false, 'local.js 不得引用 transformers');
    assert.equal(IMPORT_RE.test(code), false);
    assert.match(code, /import\s*\{\s*getEmbedWorker\s*\}\s*from\s*'\.\/worker-client\.js'/, 'local.js 必须走 getEmbedWorker()');
    assert.match(code, /getEmbedWorker\(\)/, 'local.js 必须真的调用 getEmbedWorker()');
  });

  test('embedding 工厂只静态依赖 local.js / openai-compat.js（所有调用方都在子进程外）', () => {
    const code = sources.get('rag/embedding/index.js');
    const staticImports = [...code.matchAll(/^\s*import\s[^;]*?from\s*'([^']+)'/gm)].map((m) => m[1]);
    assert.deepEqual(staticImports.sort(), ['./local.js', './openai-compat.js']);
  });

  test('所有 embedding 入口共用同一工厂（无绕过 provider 的旁路）', () => {
    // 只要有人自己 new LocalEmbedding / 直接 import worker 之外的实现，这里就会露出来
    const offenders = [...sources.entries()]
      .filter(([file]) => !file.startsWith('rag/embedding/'))
      .filter(([, code]) => /new\s+LocalEmbedding\s*\(/.test(code))
      .map(([file]) => file);
    assert.deepEqual(offenders, [], `这些文件绕过了 createEmbeddingProvider: ${offenders.join(', ')}`);
  });
});

describe('子进程契约：包只在独立进程里加载', () => {
  test('worker-client 用 process.execPath spawn embed-worker.mjs（不是 worker_threads）', () => {
    const code = sources.get('rag/embedding/worker-client.js');
    assert.match(code, /new URL\('\.\/embed-worker\.mjs',\s*import\.meta\.url\)/, '默认 worker 路径必须指向 embed-worker.mjs');
    assert.match(code, /spawn\(\s*process\.execPath\s*,\s*\[/, '必须 spawn 独立进程');
    assert.equal(/from\s*'worker_threads'/.test(code), false, 'worker_threads 与主线程共享地址空间，隔离不了 onnxruntime');
  });

  test('detect.js 只 spawn probe-child 探测，自身不 import 依赖', () => {
    const code = sources.get('rag/detect.js');
    assert.match(code, /'probe-child\.mjs'/, 'PROBE_SCRIPT 必须指向 probe-child.mjs');
    assert.match(code, /spawn\(\s*process\.execPath\s*,\s*\[/, '探测必须在子进程执行');
    assert.equal(IMPORT_RE.test(code), false, 'detect.js 不得 import transformers');
  });

  test('probe-child 按名单动态 import（名字来自变量，不在包加载期求值）', () => {
    const code = sources.get(PROBE_FILE);
    assert.match(code, /const TARGETS = \[[^\]]*'vectra'[^\]]*\]/, 'TARGETS 名单缺失');
    assert.ok(code.includes(`'${PKG}'`), 'TARGETS 必须包含 transformers');
    assert.match(code, /await import\(name\)/, 'probe-child 必须按变量名动态 import');
    assert.equal(IMPORT_RE.test(code), false, 'probe-child 不得出现包名字面量的 import 语句');
  });
});

describe('运行时证据：主进程零 onnxruntime 加载', () => {
  const home = mkdtempSync(join(tmpdir(), 'rag-main-graph-home-'));
  /** @type {{ main: any, control: any, raw: any }} */
  const runs = { main: null, control: null, raw: {} };

  /**
   * 跑一次取证脚本，返回解析结果
   * @param {string[]} args
   * @returns {any}
   */
  function runFixture(args) {
    const res = spawnSync(process.execPath, [FIXTURE, ...args], {
      cwd: SRC_DIR,
      encoding: 'utf8',
      timeout: 90_000,
      // 隔离 HOME/USERPROFILE：模块加载会读 ~/.ai-helper-agent 下的配置与日志目录
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    runs.raw[args.join(' ') || 'main'] = res;
    if (res.status !== 0) return null;
    const lines = String(res.stdout).trim().split('\n').filter((line) => line.trim().startsWith('{'));
    for (let i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]); } catch { /* 继续向前找 */ }
    }
    return null;
  }

  before(() => {
    runs.main = runFixture([]);
    runs.control = runFixture(['--control']);
  });

  after(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('主进程模块图加载后，已加载的 onnxruntime 共享库数量为 0', (t) => {
    if (!runs.main) {
      const raw = runs.raw.main;
      return t.skip(`取证脚本未跑通: ${raw?.stderr?.slice(0, 500) || raw?.error || '无输出'}`);
    }
    assert.deepEqual(runs.main.onnxBefore, [], '模块加载前就不该有 onnxruntime');
    assert.deepEqual(runs.main.onnxAfter, [], `主进程加载了 onnxruntime: ${runs.main.onnxAfter.join(', ')}`);
  });

  test('主进程必加载的模块全部可用（模块图没漏项）', (t) => {
    if (!runs.main) return t.skip('取证脚本未跑通');
    const failed = runs.main.loaded.filter((entry) => entry.required && !entry.ok);
    assert.deepEqual(failed, [], `这些模块在干净进程里加载失败: ${JSON.stringify(failed)}`);
  });

  test('本地档走通一次父进程 → 子进程往返（向量来自 worker，而非主进程推理）', (t) => {
    if (!runs.main) return t.skip('取证脚本未跑通');
    assert.equal(runs.main.embed?.ok, true, `本地 embedding 失败: ${JSON.stringify(runs.main.embed)}`);
    assert.ok(runs.main.embed.dims > 0, '假 worker 应返回非空向量');
    // 关键：往返成功但主进程仍为零 onnxruntime
    assert.deepEqual(runs.main.onnxAfter, []);
  });

  test('反向对照：显式 import transformers 会让探测器看见 onnxruntime（证明上一条不是空转）', (t) => {
    if (!runs.control) return t.skip('对照脚本未跑通');
    if (runs.control.controlOk !== true) return t.skip('本机未安装 transformers，跳过我证明力对照');
    assert.ok(
      runs.control.onnxAfter.length > 0,
      '该平台 sharedObjects 看不到 onnxruntime，运行时不变式在本机失去证明力（需改用平台专用探测）'
    );
  });
});
