// agent/src/rag/embedding/embed-worker.mjs - 本地 embedding 子进程（transformers 只允许在子进程里加载）
//
// 为什么必须是「独立进程」（Windows，2026-10 实测）：
//   语音输入（sherpa-onnx-node）与本地向量（onnxruntime-node）各自捆绑一份 onnxruntime
//   原生库。Windows 的 LoadLibrary 按「模块基名」复用模块：同一进程里出现第二份
//   onnxruntime.dll 时，后来者直接拿到先加载那份的句柄 —— 若两份版本不同，binding 要求的
//   API 版本在旧 dll 里不存在，就报
//     The operating system cannot run %1. ...\onnxruntime_binding.node
//   （Win32 193 ERROR_BAD_EXE_FORMAT / "API version [N] is not available"）。
//   用户先装知识库、后装语音输入就必现：ASR 在线识别在主进程加载 sherpa 的 dll，随后
//   RAG 的 embedding 在主进程加载 onnxruntime-node 的 dll → 冲突。
//   worker_threads 与主线程共享地址空间，隔离不了，只能用子进程（ASR 的 offline 线程同理，
//   但它加载的是同一份 sherpa，不构成冲突）。
//   推论：transformers 只能在独立子进程里加载 —— 本文件负责推理，probe-child.mjs 负责
//   可用性探测（它在 detect.js 起的临时子进程里跑）；主进程（以及 ASR 的 worker 线程）
//   任何地方 import 都会把第二份 dll 拽回主进程，把这个修复打回原形。这条不变式由单测
//   rag-no-mainprocess-transformers 锁着（静态扫描 + 子进程运行时取证）。
//
// 协议（stdin/stdout 均为单行 JSON，stdout 只允许出现协议数据）：
//   请求 {"id":1,"method":"load|embed|countTokens","params":{...}}
//   响应 {"id":1,"ok":true,"result":...} | {"id":1,"ok":false,"error":{"message":"...","code":null}}
//   方法：
//     load        {modelName?, remoteHost?, cacheDir?}      → {model, window}
//     embed       {texts:[string], modelName?, ...}         → number[][]（与 texts 同序）
//     countTokens {texts:[string], ...}                     → {counts:number[], window:number}

import { createInterface } from 'readline';
import { MODELS_DIR } from '../config.js';

const DEFAULT_MODEL = 'Xenova/bge-small-zh-v1.5';
const DEFAULT_REMOTE_HOST = 'https://hf-mirror.com/';

// stdout 是协议通道：transformers 与底层库会往 console 写日志（下载进度、形状告警），
// 必须在 import 之前把 console 改道到 stderr，否则父进程按行 JSON.parse 必然失败。
for (const level of ['log', 'info', 'debug', 'warn']) {
  console[level] = (...args) => console.error(...args);
}

// pipeline 单例（模型加载昂贵；换模型才重新加载）
let extractor = null;
let extractorModel = null;
// 加载锁：并发请求不要重复加载同一模型
let loading = null;

/**
 * 取（或加载）feature-extraction pipeline，按模型名缓存
 * @param {{ modelName?: string, remoteHost?: string, cacheDir?: string }} params
 * @returns {Promise<object>} transformers pipeline
 */
async function getExtractor(params = {}) {
  const modelName = String(params.modelName || DEFAULT_MODEL);
  const remoteHost = String(params.remoteHost || DEFAULT_REMOTE_HOST);
  const cacheDir = String(params.cacheDir || MODELS_DIR);

  if (extractor && extractorModel === modelName) return extractor;

  if (loading) {
    await loading.catch(() => {});
    if (extractor && extractorModel === modelName) return extractor;
  }

  loading = (async () => {
    const { env, pipeline } = await import('@huggingface/transformers');
    // 端点与缓存目录必须在模型加载前设置（缓存目录独立于 node_modules，重装不丢模型）
    env.remoteHost = remoteHost;
    env.cacheDir = cacheDir;
    console.error(`[RAG][embed-worker] loading model: ${modelName} (cache: ${cacheDir})`);
    const next = await pipeline('feature-extraction', modelName, { dtype: 'q8' });
    extractor = next;
    extractorModel = modelName;
    console.error(`[RAG][embed-worker] model ready: ${modelName}`);
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
  return extractor;
}

/**
 * 模型上下文窗口（以 tokenizer 为准，不自己写常量）
 * @param {object} ex pipeline
 * @returns {number}
 */
function modelWindow(ex) {
  return Number(ex?.tokenizer?.model_max_length) || 0;
}

const handlers = {
  async load(params) {
    const ex = await getExtractor(params);
    return { model: extractorModel, window: modelWindow(ex) };
  },

  async embed(params) {
    const texts = Array.isArray(params.texts) ? params.texts : [];
    if (texts.length === 0) return [];
    const ex = await getExtractor(params);
    // 单次批量推理：pipeline 支持数组输入，输出为 [batch, seq, dim] 张量
    const output = await ex(texts.map((t) => String(t ?? '')), { pooling: 'mean', normalize: true });
    return output.tolist();
  },

  async countTokens(params) {
    const texts = Array.isArray(params.texts) ? params.texts : [];
    if (texts.length === 0) return { counts: [], window: 0 };
    const ex = await getExtractor(params);
    const tokenizer = ex.tokenizer;
    const window = modelWindow(ex);
    // 必须 truncation: false —— 跟着 pipeline 的口径数只会永远数到窗口值，看不见被截掉多少
    const counts = texts.map((t) => {
      const encoded = tokenizer(String(t ?? ''), { padding: false, truncation: false });
      const dims = encoded?.input_ids?.dims;
      return Array.isArray(dims) && dims.length ? Number(dims[dims.length - 1]) : 0;
    });
    return { counts, window };
  },
};

/**
 * 写一行协议响应（stdout 只写协议数据）
 * @param {{ id: number|null, ok: boolean, result?: any, error?: object }} payload
 */
function writeLine(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function handle(request) {
  const id = Number.isFinite(request?.id) ? request.id : null;
  const method = String(request?.method || '');
  const fn = handlers[method];
  if (!fn) {
    writeLine({ id, ok: false, error: { message: `unknown method: ${method}`, code: null } });
    return;
  }
  try {
    const result = await fn(request?.params || {});
    writeLine({ id, ok: true, result });
  } catch (err) {
    const message = err?.message ? String(err.message) : String(err);
    // 原始 message 必须原样透传：父进程靠它识别 onnxruntime dll 冲突（cannot run %1）等原生错误
    writeLine({ id, ok: false, error: { message, code: err?.code ?? null } });
    console.error(`[RAG][embed-worker] ${method} failed: ${message}`);
  }
}

// 串行处理：一次只跑一个请求，避免两个批量推理交错抢同一份会话内存
let chain = Promise.resolve();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    writeLine({ id: null, ok: false, error: { message: 'invalid json request', code: null } });
    return;
  }
  chain = chain.then(() => handle(request), () => handle(request));
});
// 父进程关闭 stdin（正常退出/空闲回收）即收工：不留原生句柄让进程挂住。
// 不能用 process.exit(0)：模型加载后进程里有 onnxruntime 的原生线程，强退会在静态析构
// 阶段撞 "mutex lock failed: Invalid argument" 并以 SIGABRT 结束（macOS 实测，退出码 134），
// 日志里看起来像崩溃，父进程那边也是 signal 而不是 code 0。改为让事件循环自己排空；
// 万一有残留句柄把进程吊住，再用兜底定时器强退（那时已经没有别的选择了）。
rl.on('close', () => {
  process.exitCode = 0;
  const timer = setTimeout(() => process.exit(0), 5000);
  if (typeof timer.unref === 'function') timer.unref();
});

process.on('uncaughtException', (err) => {
  console.error(`[RAG][embed-worker] uncaught: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error(`[RAG][embed-worker] unhandled rejection: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
