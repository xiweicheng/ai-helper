// agent/test/fixtures/asr-fake-transcribe.mjs
//
// worker 端到端测试用的假 transcribe 实现（offline-pool 测试通过
// AI_HELPER_ASR_OFFLINE_IMPL 注入到 offline-worker.js，避免加载真实 sherpa-onnx）。
//
// 行为由任务 opts 控制：
//   - busyMs：在 worker 里同步空转，用来证明主线程没有被卡住
//   - throwCode：抛一个带 code 的错误，用来验证错误码穿透 worker 边界

/** 同步空转 ms 毫秒（故意阻塞所在线程） */
function spin(ms) {
  if (!(ms > 0)) return;
  const until = Date.now() + ms;
  while (Date.now() < until) { /* 空转 */ }
}

function maybeThrow(opts) {
  if (!opts || !opts.throwCode) return;
  const err = new Error(`fake decode failed: ${opts.throwCode}`);
  err.code = opts.throwCode;
  throw err;
}

export function transcribeSamples(samples, opts = {}) {
  spin(opts.busyMs);
  maybeThrow(opts);
  const src = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  return { text: `fake:${src.length}`, segments: 1, peak: 1 };
}

export function transcribeWav(buffer, opts = {}) {
  spin(opts.busyMs);
  maybeThrow(opts);
  const length = Buffer.isBuffer(buffer)
    ? buffer.length
    : (buffer && buffer.byteLength) || 0;
  return { text: `wav:${length}`, durationMs: 250, engineMs: 0, segments: 1, peak: 1 };
}