// agent/src/asr/sentence-splitter.js - 流式切句判定（纯函数，无 IO、无原生依赖）
//
// 为什么不用 silero VAD：sherpa-onnx-node 2.0.1 的 vad.front() 必 SIGSEGV，
// 原生层崩溃 JS 拦不住，整个代理进程退出（见 engine.js getVad 注释）。
// 改用纯 JS 算每帧 RMS —— 精度不如 VAD，但零风险。
//
// 为什么禁止固定时长硬切：实测 8s 硬切会切在词中间，产出
// 「牛。头不对马嘴」「松手之后。后仍然」「230。9兆」，CER 从 3.7% 升到 5.5%。

export const FRAME_MS = 100;
export const SILENCE_RMS = 0.006;
export const SILENCE_FRAMES = 3;
export const MAX_SENTENCE_MS = 12000;
export const LOOKBACK_MS = 2000;

/**
 * 一段 PCM 的均方根幅度
 * @param {Float32Array|null} samples
 * @returns {number}
 */
export function rmsOf(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * 决定切点帧索引
 * @param {Array<{samples: Float32Array, rms: number}>} frames
 * @param {{frameMs?: number}} [opts]
 * @returns {number} -1 不切；1..len-1 切点；len 整段静音（丢弃）
 */
export function chooseCutIndex(frames, opts = {}) {
  if (!Array.isArray(frames) || frames.length < 2) return -1;
  const frameMs = Number(opts.frameMs) > 0 ? Number(opts.frameMs) : FRAME_MS;

  // 1) 末尾连续静音：切在静音段起点，静音留给下一句（本句不带尾巴静音）
  let silent = 0;
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].rms < SILENCE_RMS) silent += 1;
    else break;
  }
  if (silent >= SILENCE_FRAMES) {
    const cut = frames.length - silent;
    // cut === 0 说明整段都是静音：交给调用方丢弃，不要切出空 head
    return cut === 0 ? frames.length : cut;
  }

  // 2) 超长兜底：回溯最近 LOOKBACK_MS 找 RMS 最低帧（大概率是词间停顿）
  const totalMs = frames.length * frameMs;
  if (totalMs >= MAX_SENTENCE_MS) {
    const lookbackFrames = Math.max(1, Math.round(LOOKBACK_MS / frameMs));
    const from = Math.max(1, frames.length - lookbackFrames); // from >= 1 保证 head 非空
    let best = -1;
    let bestRms = Infinity;
    for (let i = from; i < frames.length; i++) {
      if (frames[i].rms < bestRms) {
        bestRms = frames[i].rms;
        best = i;
      }
    }
    if (best > 0) return best;
  }

  return -1;
}
