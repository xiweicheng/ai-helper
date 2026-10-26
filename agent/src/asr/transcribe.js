// agent/src/asr/transcribe.js - 整段音频 → 文本（WAV 解析 + 重采样 + VAD 切段 + 定稿识别）
//
// 输入约定：PCM16 / 单声道 / 常见采样率（8k/16k/44.1k/48k）的 WAV。
// 非 16k 一律线性插值重采样（语音 fbank 特征对重采样质量不敏感，线性足够且零依赖）。
//
// 为什么按 VAD 切段再逐段识别：SenseVoice 单次可处理较长音频，但长句一次性喂入会
// 让中间静音稀释注意力、且失败即全损。切段并行度不追求（单用户本机 CPU 独占），
// 但"某段失败不拖垮整段"必须做到。

import { getOfflineRecognizer, getVad } from './engine.js';

// 引擎期望采样率
const TARGET_SAMPLE_RATE = 16000;

// 单段最长时长（VAD 的 maxSpeechDuration 之外的兜底，防止极端参数下无限长）
const MAX_SEGMENT_SECONDS = 30;

// VAD 窗口（silero v5 要求 512 @16k）
const VAD_WINDOW = 512;

/**
 * 解析 WAV（仅支持 PCM/IEEE-float 的基础形态；返回空 samples 表示不可识别）
 * @param {Buffer} buffer
 * @returns {{ sampleRate: number, channels: number, bitsPerSample: number, float: boolean, samples: Float32Array }|null}
 */
export function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

  let offset = 12;
  let fmt = null;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (body + 16 > buffer.length) return null;
      const audioFormat = buffer.readUInt16LE(body);
      const channels = buffer.readUInt16LE(body + 2);
      const sampleRate = buffer.readUInt32LE(body + 4);
      const bitsPerSample = buffer.readUInt16LE(body + 14);
      fmt = { audioFormat, channels, sampleRate, bitsPerSample };
    } else if (id === 'data') {
      dataStart = body;
      // 部分录音器写 data 长度为 0/0xFFFFFFFF（流式未回填），按实际剩余长度处理
      dataLength = size > 0 && body + size <= buffer.length ? size : buffer.length - body;
      break;
    }
    // chunk 按 2 字节对齐
    offset = body + size + (size % 2);
  }

  if (!fmt || dataStart < 0) return null;
  const { audioFormat, channels, sampleRate, bitsPerSample } = fmt;
  if (!(sampleRate > 0) || !(channels > 0)) return null;
  // 1 = PCM integer，3 = IEEE float
  const isFloat = audioFormat === 3;
  const isPcm = audioFormat === 1;
  if (!isFloat && !isPcm) return null;
  if (![8, 16, 24, 32].includes(bitsPerSample)) return null;

  const bytesPerSample = bitsPerSample / 8;
  const frameBytes = bytesPerSample * channels;
  if (frameBytes <= 0) return null;
  const frames = Math.floor(dataLength / frameBytes);
  if (frames <= 0) return null;

  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    // 多声道只取第一声道（麦克风录音恒为 mono；立体声按左声道处理）
    const p = dataStart + i * frameBytes;
    let value;
    if (isFloat) {
      value = bitsPerSample === 32 ? buffer.readFloatLE(p) : 0;
    } else if (bitsPerSample === 16) {
      value = buffer.readInt16LE(p) / 32768;
    } else if (bitsPerSample === 8) {
      // 8bit PCM 是无符号、中心 128
      value = (buffer.readUInt8(p) - 128) / 128;
    } else if (bitsPerSample === 24) {
      const b0 = buffer.readUInt8(p);
      const b1 = buffer.readUInt8(p + 1);
      const b2 = buffer.readInt8(p + 2);
      value = ((b2 << 16) | (b1 << 8) | b0) / 8388608;
    } else {
      value = buffer.readInt32LE(p) / 2147483648;
    }
    samples[i] = Number.isFinite(value) ? value : 0;
  }

  return { sampleRate, channels, bitsPerSample, float: isFloat, samples };
}

/**
 * 线性插值重采样到 16k
 * @param {Float32Array} samples
 * @param {number} fromRate
 * @param {number} [toRate]
 * @returns {Float32Array}
 */
export function resampleTo16k(samples, fromRate, toRate = TARGET_SAMPLE_RATE) {
  if (!(fromRate > 0) || !samples || samples.length === 0) return new Float32Array(0);
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, samples.length - 1);
    const frac = pos - left;
    out[i] = samples[left] * (1 - frac) + samples[right] * frac;
  }
  return out;
}

/**
 * 计算整段音频的峰值（用于"全静音"的快速判定，避免白跑一遍模型）
 * @param {Float32Array} samples
 * @returns {number}
 */
export function peakAmplitude(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

/**
 * 用 VAD 切段；VAD 不可用时按固定长度切（30s 上限）
 * @param {object|null} vad
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {Float32Array[]}
 */
export function splitByVad(vad, samples, sampleRate = TARGET_SAMPLE_RATE) {
  const fixedChunks = () => {
    const maxLen = MAX_SEGMENT_SECONDS * sampleRate;
    const chunks = [];
    for (let start = 0; start < samples.length; start += maxLen) {
      chunks.push(samples.subarray(start, Math.min(start + maxLen, samples.length)));
    }
    return chunks.length > 0 ? chunks : [samples];
  };

  if (!vad || typeof vad.acceptWaveform !== 'function') return fixedChunks();

  const segments = [];
  try {
    for (let offset = 0; offset + VAD_WINDOW <= samples.length; offset += VAD_WINDOW) {
      const window = samples.subarray(offset, offset + VAD_WINDOW);
      vad.acceptWaveform(window);
      while (vad.isDetected && vad.isDetected()) {
        const seg = vad.front();
        // sherpa VAD 的 front() 返回 { samples: Float32Array, start: number } 形态
        const data = seg && seg.samples ? seg.samples : seg;
        if (data && data.length > 0) segments.push(data);
        vad.pop();
      }
    }
    // 收尾：把残余语音段取出
    if (typeof vad.flush === 'function') vad.flush();
    while (vad.isDetected && vad.isDetected()) {
      const seg = vad.front();
      const data = seg && seg.samples ? seg.samples : seg;
      if (data && data.length > 0) segments.push(data);
      vad.pop();
    }
  } catch {
    // VAD 行为异常（版本差异）：退回固定切分，保证仍能出结果
    return fixedChunks();
  }

  return segments.length > 0 ? segments : fixedChunks();
}

/**
 * 清掉 SenseVoice 输出的语种/情绪标记（`<|zh|><|NEUTRAL|><|Speech|>`），只留正文
 * @param {string} text
 * @returns {string}
 */
export function stripSenseVoiceTags(text) {
  return String(text || '')
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 中文排版收口：去掉中文之间的多余空格（模型常按词输出空格）
 * @param {string} text
 * @returns {string}
 */
export function tidyChineseSpacing(text) {
  return String(text || '')
    .replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, '$1')
    .replace(/[ \t]+([，。！？；：、）】」』])/g, '$1')
    .replace(/([（【「『])[ \t]+/g, '$1')
    .trim();
}

/**
 * 解码单个语音段
 * @param {object} recognizer
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {string}
 */
function decodeSegment(recognizer, samples, sampleRate) {
  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  recognizer.decode(stream);
  const result = typeof recognizer.getResult === 'function'
    ? recognizer.getResult(stream)
    : { text: '' };
  try {
    if (typeof stream.free === 'function') stream.free();
  } catch { /* 忽略释放失败 */ }
  return tidyChineseSpacing(stripSenseVoiceTags(result && result.text ? result.text : ''));
}

/**
 * 整段转写（同步阻塞；调用方负责放在请求处理里等待）
 * @param {Buffer} wavBuffer
 * @param {{ offlineModel: object, vadModel?: object|null, language?: string, idleUnloadMs?: number }} opts
 * @returns {{ text: string, durationMs: number, engineMs: number, segments: number, peak: number }}
 */
export function transcribeWav(wavBuffer, opts = {}) {
  const startedAt = Date.now();
  const parsed = parseWav(wavBuffer);
  if (!parsed) {
    const err = new Error('unsupported_audio');
    err.code = 'unsupported_audio';
    throw err;
  }

  const originalDurationMs = Math.round((parsed.samples.length / parsed.sampleRate) * 1000);
  const samples = resampleTo16k(parsed.samples, parsed.sampleRate, TARGET_SAMPLE_RATE);
  const result = transcribeSamples(samples, opts);
  return {
    ...result,
    durationMs: originalDurationMs,
    engineMs: Date.now() - startedAt,
  };
}

/**
 * 对已重采样到 16k 的 Float32 波形做整段定稿识别（WS 会话 stop 路径复用）
 * @param {Float32Array} samples 16k mono
 * @param {{ offlineModel: object, vadModel?: object|null, idleUnloadMs?: number }} opts
 * @returns {{ text: string, segments: number, peak: number }}
 */
export function transcribeSamples(samples, opts = {}) {
  const src = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  const peak = peakAmplitude(src);

  // 全静音：不跑模型，直接回空文本（前端据此提示「未识别到语音」）
  if (peak < 0.003 || src.length < TARGET_SAMPLE_RATE * 0.2) {
    return { text: '', segments: 0, peak };
  }

  if (!opts.offlineModel) {
    const err = new Error('model_missing');
    err.code = 'model_missing';
    throw err;
  }

  const recognizer = getOfflineRecognizer(opts.offlineModel, { idleUnloadMs: opts.idleUnloadMs });
  let vad = null;
  if (opts.vadModel) {
    try {
      vad = getVad(opts.vadModel, { idleUnloadMs: opts.idleUnloadMs });
    } catch {
      vad = null; // VAD 加载失败不应让整段转写失败
    }
  }

  const segments = splitByVad(vad, src, TARGET_SAMPLE_RATE);
  const texts = [];
  for (const seg of segments) {
    const text = decodeSegment(recognizer, seg, TARGET_SAMPLE_RATE);
    if (text) texts.push(text);
  }

  return { text: tidyJoin(texts), segments: segments.length, peak };
}

/**
 * 拼接多段识别结果：中文片段直接相接，纯英文片段之间补空格
 * @param {string[]} parts
 * @returns {string}
 */
export function tidyJoin(parts) {
  let out = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (!out) { out = part; continue; }
    const last = out[out.length - 1];
    const first = part[0];
    const needSpace = /[A-Za-z0-9]/.test(last) && /[A-Za-z0-9]/.test(first);
    out += needSpace ? ` ${part}` : part;
  }
  return tidyChineseSpacing(out);
}
