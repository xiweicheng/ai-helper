// agent/src/asr/session.js - 流式识别会话（WS /ws/asr/:sessionId）
//
// 协议（客户端 → 服务端）：
//   - 二进制帧：PCM16LE / 单声道 / 16kHz（每帧 100ms 左右）
//   - JSON 帧：{type:'start', language?} / {type:'stop'} / {type:'cancel'}
// 服务端 → 客户端：
//   - {type:'ready', draft, finalize}  会话就绪（draft=false 表示没有流式模型，只等 stop 定稿）
//   - {type:'partial', text}           流式草稿（节流 150ms）
//   - {type:'endpoint', text}          检测到句尾（草稿已提交为稳定片段）
//   - {type:'final', text, fallback}   定稿（fallback=true 表示退化为流式文本）
//   - {type:'error', code, error}      busy / model_missing / internal / rss_pressure
//
// 资源回收：连接关闭（未 stop）、空闲 30s、总时长 5min、并发超限 —— 全部收敛到 release()。

import {
  MAX_SESSIONS,
  SESSION_IDLE_MS,
  MAX_RECORDING_MS,
  RSS_LIMIT_BYTES,
} from './config.js';
import { tidyJoin, tidyChineseSpacing, stripSenseVoiceTags, transcribeSamples } from './transcribe.js';
import { getOnlineRecognizer as defaultGetOnline } from './engine.js';

// 草稿推送节流（150ms：肉眼连贯且不会把 WS 打满）
const PARTIAL_THROTTLE_MS = 150;

// 单帧最大字节数（10s @16k mono PCM16 = 320KB；超过视为异常客户端）
const MAX_FRAME_BYTES = 320 * 1024;

/**
 * PCM16LE Buffer → Float32Array（-1..1）
 * @param {Buffer} buf
 * @returns {Float32Array}
 */
export function pcm16ToFloat32(buf) {
  const count = Math.floor(buf.length / 2);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = buf.readInt16LE(i * 2) / 32768;
  }
  return out;
}

/**
 * 创建会话管理器（deps 可注入，便于单测）
 * @param {{
 *   getModels: () => { online: object|null, offline: object|null, vad: object|null },
 *   getIdleUnloadMs?: () => number,
 *   getOnlineRecognizer?: Function,
 *   getOfflineRecognizer?: Function,
 *   getVad?: Function,
 *   transcribe?: Function,
 *   maxSessions?: number,
 *   now?: () => number,
 * }} deps
 * @returns {object}
 */
export function createAsrSessionManager(deps) {
  const sessions = new Map();
  const now = deps.now || (() => Date.now());
  const maxSessions = Number.isFinite(deps.maxSessions) && deps.maxSessions > 0
    ? deps.maxSessions
    : MAX_SESSIONS;
  const getIdleUnloadMs = deps.getIdleUnloadMs || (() => 0);
  const transcribe = deps.transcribe || transcribeSamples;

  /**
   * 发送 JSON 帧（连接已断时静默忽略）
   */
  function send(session, payload) {
    const ws = session.ws;
    if (!ws || ws.readyState !== 1) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // 发送失败说明连接已坏，交给 close 事件回收
    }
  }

  /**
   * 释放会话占用的全部资源（幂等）
   */
  function release(session) {
    if (!session || session.released) return;
    session.released = true;
    if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
    if (session.maxTimer) { clearTimeout(session.maxTimer); session.maxTimer = null; }
    if (session.onlineStream && typeof session.onlineStream.free === 'function') {
      try { session.onlineStream.free(); } catch { /* 原生释放失败忽略 */ }
    }
    session.onlineStream = null;
    session.chunks = [];
    sessions.delete(session.id);
  }

  /**
   * 重置空闲计时（每帧/每条控制消息都调）
   */
  function touch(session) {
    session.lastActivityAt = now();
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      // 空闲超时：静默收敛（客户端可能已崩，不依赖它发 cancel）
      send(session, { type: 'error', code: 'idle_timeout', error: 'session idle timeout' });
      release(session);
      try { session.ws.close(); } catch { /* 忽略 */ }
    }, SESSION_IDLE_MS);
    if (typeof session.idleTimer.unref === 'function') session.idleTimer.unref();
  }

  /**
   * 建流（失败不抛出：draft=false，客户端退化为「松手整段定稿」）
   */
  function ensureOnline(session) {
    if (session.onlineReady) return true;
    session.onlineReady = true;
    const models = deps.getModels();
    session.models = models;
    if (!models.online) return false;
    try {
      const rec = (deps.getOnlineRecognizer || defaultGetOnline)(models.online, { idleUnloadMs: getIdleUnloadMs() });
      session.onlineRecognizer = rec;
      session.onlineStream = rec.createStream();
      return true;
    } catch (err) {
      session.onlineRecognizer = null;
      session.onlineStream = null;
      deps.onError?.('online_init_failed', err);
      return false;
    }
  }

  /**
   * 解码当前流并推送草稿（节流）
   */
  function pumpPartial(session, force = false) {
    const rec = session.onlineRecognizer;
    const stream = session.onlineStream;
    if (!rec || !stream) return;

    while (typeof rec.isReady === 'function' && rec.isReady(stream)) {
      rec.decode(stream);
    }

    let text = '';
    try {
      const result = rec.getResult(stream);
      text = tidyChineseSpacing(stripSenseVoiceTags(result && result.text ? result.text : ''));
    } catch {
      return;
    }

    // 即使本次被节流也要更新 currentText：stop 时若退化为流式文本，
    // 取到的必须是「已解码到的最新文本」，而不是上一次推送的旧值（否则丢掉尾部）。
    // 去重靠 lastSentText（真正推送过的文本），与 currentText 分开。
    if (text && text !== session.currentText) session.currentText = text;

    const t = now();
    if (!force && t - session.lastPartialAt < PARTIAL_THROTTLE_MS) return;
    if (!text || text === session.lastSentText) return;
    session.lastPartialAt = t;
    session.lastSentText = text;

    send(session, { type: 'partial', text: tidyJoin([session.committedText, text]) });
  }

  /**
   * 句子结束：把当前草稿提交为稳定片段并重置流
   */
  function handleEndpoint(session) {
    const rec = session.onlineRecognizer;
    const stream = session.onlineStream;
    if (!rec || !stream) return;
    let text = '';
    try {
      const result = rec.getResult(stream);
      text = tidyChineseSpacing(stripSenseVoiceTags(result && result.text ? result.text : ''));
    } catch {
      text = '';
    }
    if (text) {
      session.committedText = tidyJoin([session.committedText, text]);
      send(session, { type: 'endpoint', text: session.committedText });
    }
    session.currentText = '';
    session.lastSentText = '';
    try { rec.reset(stream); } catch { /* 版本差异：重置失败仍可继续累积 */ }
  }

  /**
   * 处理 stop：优先 offline 定稿，必要时退回流式文本
   */
  function finalize(session) {
    const models = session.models || deps.getModels();
    const samples = concatChunks(session.chunks);
    session.chunks = [];

    const draftText = tidyJoin([session.committedText, session.currentText]);

    if (!models.offline) {
      send(session, { type: 'final', text: draftText, fallback: true });
      return;
    }

    // RSS 保护：接近阈值时不做 offline 定稿（避免 OOM 拖垮整个代理）
    const rss = typeof process.memoryUsage === 'function' ? process.memoryUsage().rss : 0;
    if (rss > RSS_LIMIT_BYTES) {
      deps.onLog?.('asr_offline_skipped', { reason: 'rss_pressure', rss });
      send(session, { type: 'final', text: draftText, fallback: true });
      return;
    }

    if (samples.length === 0) {
      send(session, { type: 'final', text: draftText, fallback: !draftText });
      return;
    }

    try {
      const result = transcribe(samples, {
        offlineModel: models.offline,
        vadModel: models.vad || null,
        idleUnloadMs: getIdleUnloadMs(),
        language: session.language,
      });
      send(session, { type: 'final', text: result.text || draftText, fallback: false });
    } catch (err) {
      deps.onError?.('offline_finalize_failed', err);
      send(session, { type: 'final', text: draftText, fallback: true });
    }
  }

  /**
   * 处理一条控制消息
   */
  function handleControl(session, message) {
    const type = message && message.type;

    if (type === 'start') {
      if (typeof message.language === 'string') session.language = message.language;
      const draft = ensureOnline(session);
      send(session, { type: 'ready', draft, finalize: Boolean(session.models.offline) });
      return;
    }

    if (type === 'stop') {
      if (session.finishing) return;
      session.finishing = true;
      try {
        finalize(session);
      } finally {
        release(session);
        try { session.ws.close(); } catch { /* 忽略 */ }
      }
      return;
    }

    if (type === 'cancel') {
      release(session);
      try { session.ws.close(); } catch { /* 忽略 */ }
      return;
    }

    // 未知控制帧：忽略（向前兼容）
  }

  /**
   * 处理二进制音频帧
   */
  function handleAudio(session, chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) return;
    if (chunk.length > MAX_FRAME_BYTES) {
      send(session, { type: 'error', code: 'frame_too_large', error: `frame > ${MAX_FRAME_BYTES} bytes` });
      return;
    }
    touch(session);
    if (!session.onlineReady) ensureOnline(session);

    const samples = pcm16ToFloat32(chunk);
    if (samples.length === 0) return;
    session.wavSamples += samples.length;

    // 保留整段波形用于 stop 时 offline 定稿（5min @16k = 4.8M float ≈ 19MB，可接受）
    session.chunks.push(samples);

    if (session.onlineStream && session.onlineRecognizer) {
      try {
        session.onlineStream.acceptWaveform({ sampleRate: 16000, samples });
      } catch (err) {
        deps.onError?.('accept_waveform_failed', err);
        session.onlineStream = null;
        session.onlineRecognizer = null;
      }
      if (session.onlineStream) {
        pumpPartial(session);
        if (typeof session.onlineRecognizer.isEndpoint === 'function') {
          let endpoint = false;
          try { endpoint = session.onlineRecognizer.isEndpoint(session.onlineStream) === true; } catch { endpoint = false; }
          if (endpoint) handleEndpoint(session);
        }
      }
    }
  }

  /**
   * 接收一个新连接
   * @param {import('ws').WebSocket} ws
   * @param {string} id
   * @returns {boolean} false = 并发超限，已拒绝
   */
  function attach(ws, id, options = {}) {
    if (sessions.size >= maxSessions) {
      try {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'error', code: 'busy', error: 'another ASR session is active' }));
        }
        ws.close();
      } catch { /* 忽略 */ }
      return false;
    }

    const session = {
      id,
      ws,
      language: typeof options.language === 'string' ? options.language : 'auto',
      onlineReady: false,
      onlineRecognizer: null,
      onlineStream: null,
      models: null,
      chunks: [],
      wavSamples: 0,
      committedText: '',
      currentText: '',
      lastSentText: '',
      lastPartialAt: 0,
      lastActivityAt: now(),
      createdAt: now(),
      finishing: false,
      released: false,
      idleTimer: null,
      maxTimer: null,
    };
    sessions.set(id, session);
    touch(session);

    // 总时长上限：到时自动定稿并结束（长按不现实，5 分钟已是单次输入的合理上限）
    session.maxTimer = setTimeout(() => {
      send(session, { type: 'error', code: 'max_duration', error: 'recording length limit reached' });
      try { finalize(session); } catch { /* 忽略 */ }
      release(session);
      try { ws.close(); } catch { /* 忽略 */ }
    }, MAX_RECORDING_MS);
    if (typeof session.maxTimer.unref === 'function') session.maxTimer.unref();

    ws.on('message', (data, isBinary) => {
      if (session.released) return;
      if (isBinary) {
        handleAudio(session, Buffer.isBuffer(data) ? data : Buffer.from(data));
        return;
      }
      touch(session);
      let message = null;
      try { message = JSON.parse(data.toString()); } catch { return; }
      handleControl(session, message);
    });

    ws.on('close', () => {
      // 未走 stop 就断开（关面板/切标签页）：直接释放，不产出 final
      if (!session.finishing) {
        deps.onLog?.('asr_session_closed', { id, samples: session.wavSamples });
      }
      release(session);
    });

    ws.on('error', () => release(session));

    return true;
  }

  return {
    attach,
    release,
    /** 当前活跃会话数（测试/状态接口用） */
    activeCount: () => sessions.size,
    /** 主动关闭全部会话（停服路径） */
    closeAll: () => {
      for (const session of Array.from(sessions.values())) {
        send(session, { type: 'error', code: 'server_shutdown', error: 'agent is shutting down' });
        release(session);
        try { session.ws.close(); } catch { /* 忽略 */ }
      }
    },
    _sessions: sessions,
  };
}

/**
 * 拼接 Float32 分片
 * @param {Float32Array[]} chunks
 * @returns {Float32Array}
 */
function concatChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return new Float32Array(0);
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
