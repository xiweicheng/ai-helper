// agent/test/fixtures/rag-main-module-graph.mjs - 「主进程模块图不碰 onnxruntime」取证脚本
//
// 由 test/unit/rag-no-mainprocess-transformers.unit.test.js spawn，跑在全新子进程里。
// 用法：
//   默认         加载主进程的 RAG / 长期记忆模块，并真的走一次「父进程 → embedding 子进程」
//                往返（用假 worker，不加载任何原生库），然后报告本进程已加载的 onnxruntime 共享库。
//   --control    反向对照：显式 import @huggingface/transformers，证明「共享库清单」这个探测器
//                在看得出 ort 加载的平台上确实有效（否则「零 onnxruntime」可能只是探不到）。
//
// 输出：stdout 末行单行 JSON；退出码恒为 0，结论以 JSON 为准。

import { fileURLToPath } from 'node:url';

const CONTROL = process.argv.includes('--control');

// stdout 只留给协议结果：createEmbeddingProvider 等模块会打 console.log
for (const method of ['log', 'info', 'debug', 'warn']) {
  console[method] = (...args) => console.error(...args);
}

const SRC = new URL('../../src/', import.meta.url);
const FAKE_WORKER = fileURLToPath(new URL('./rag-fake-embed-worker.mjs', import.meta.url));

// 主进程会加载的模块（缺一个就说明模块图变了，必须显式处理）
const CORE = [
  'rag/errors.js',
  'rag/detect.js',
  'rag/embedding/index.js',
  'rag/embedding/local.js',
  'rag/embedding/worker-client.js',
  'memory/service.js',
  'memory/routes.js',
];

// 需要 RAG 可选依赖（vectra 等）：装上就一起验证，没装（干净 clone）不算失败
const OPTIONAL = [
  'rag/manager.js',
  'rag/routes.js',
];

/** 本进程已加载的 onnxruntime 共享库（darwin .dylib / win32 .dll / linux .so 都按名字匹配） */
function onnxLibs() {
  const report = process.report.getReport();
  return (report.sharedObjects || []).filter((p) => /onnxruntime/i.test(p));
}

/** @param {unknown} err */
function short(err) {
  const text = err && err.message ? String(err.message) : String(err);
  return text.split('\n')[0].slice(0, 300);
}

/**
 * 加载一个模块并记录结果（单个失败不影响后续取证）
 * @param {string} rel - 相对 src/ 的路径
 * @param {boolean} required - 是否属于主进程必加载模块
 */
async function loadOne(rel, required) {
  try {
    await import(new URL(rel, SRC).href);
    return { module: rel, required, ok: true };
  } catch (err) {
    return { module: rel, required, ok: false, error: short(err) };
  }
}

async function main() {
  const out = {
    mode: CONTROL ? 'control' : 'main',
    loaded: [],
    embed: null,
    onnxBefore: onnxLibs(),
    onnxAfter: [],
  };

  if (CONTROL) {
    try {
      await import('@huggingface/transformers');
      out.controlOk = true;
    } catch (err) {
      out.controlOk = false;
      out.controlError = short(err);
    }
    out.onnxAfter = onnxLibs();
    return out;
  }

  // 假 worker：让本地档真的完成一次父进程 → 子进程往返，但两端都不加载原生库
  process.env.AI_HELPER_RAG_EMBED_WORKER = FAKE_WORKER;

  for (const rel of CORE) out.loaded.push(await loadOne(rel, true));
  for (const rel of OPTIONAL) out.loaded.push(await loadOne(rel, false));

  try {
    const { createEmbeddingProvider } = await import(new URL('rag/embedding/index.js', SRC).href);
    const provider = createEmbeddingProvider({ mode: 'local', modelName: 'fake-model' });
    const vector = await provider.embedQuery('测试');
    out.embed = { ok: true, dims: Array.isArray(vector) ? vector.length : 0 };
  } catch (err) {
    out.embed = { ok: false, error: short(err) };
  }

  // 收掉子进程，否则父进程要等空闲回收才能退出
  try {
    const { closeEmbedWorker } = await import(new URL('rag/embedding/worker-client.js', SRC).href);
    await closeEmbedWorker();
  } catch { /* 已关或从未启动 */ }

  out.onnxAfter = onnxLibs();
  return out;
}

const result = await main();
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
