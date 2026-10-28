// agent/test/fixtures/rag-fake-embed-worker.mjs - 假 embedding 子进程（单测专用，不加载 transformers）
//
// 协议与 src/rag/embedding/embed-worker.mjs 完全一致；行为由请求 params 驱动：
//   failMessage: 以该 message 返回失败（用于覆盖错误映射）
//   delayMs:     延迟后再响应（用于覆盖超时/串行队列）
//   crash:       直接退出进程（用于覆盖子进程崩溃后拒绝在途请求）
//   dims:        向量维度（默认 3）

import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    return;
  }
  const { id, method, params = {} } = request;
  if (params.crash) process.exit(1);
  if (params.delayMs) await sleep(Number(params.delayMs));
  if (params.failMessage) {
    reply({ id, ok: false, error: { message: String(params.failMessage), code: params.failCode || null } });
    return;
  }
  const texts = Array.isArray(params.texts) ? params.texts : [];
  if (method === 'load') {
    reply({ id, ok: true, result: { model: params.modelName || 'fake-model', window: 512 } });
    return;
  }
  if (method === 'embed') {
    const dims = Number(params.dims) > 0 ? Number(params.dims) : 3;
    reply({ id, ok: true, result: texts.map((t) => new Array(dims).fill(String(t).length)) });
    return;
  }
  if (method === 'countTokens') {
    reply({ id, ok: true, result: { counts: texts.map((t) => String(t).length), window: 512 } });
    return;
  }
  reply({ id, ok: false, error: { message: `unknown method: ${method}`, code: null } });
});

rl.on('close', () => process.exit(0));
