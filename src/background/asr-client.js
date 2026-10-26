// background/asr-client.js - 语音识别（本地 STT）客户端
//
// 职责：把代理端 /api/asr/* 与 /ws/asr/:id 通道封装成简单 API，供 background 消息分发复用。
// 设计要点：
//   - 状态读取带 10s 缓存：侧边栏每次初始化都会问一次，避免频繁打爆本机代理；
//   - 整段转写走一次性 HTTP（agentRequest），流式会话走 WebSocket（仅 background 能拿到 token）；
//   - 单向失败不缓存：安装/检测类接口一律绕过缓存，保证配置页点「重新检测」立即生效。
//
// 代理端接口参见 agent/src/asr/routes.js 与 agent/src/server.js 的 /ws/asr/:id 分支。

import { agentRequest, agentGet, getAgentConfig, createExecWebSocket } from './local-agent-client.js';
import { registerTranslations, t } from '../shared/i18n.js';
import logger from '../shared/logger.js';

registerTranslations('zh', {
  asrClient: {
    agentNotPaired: 'Agent 未配对，请先在设置中完成配对',
    connectFailed: '语音会话连接失败: {error}',
    sessionClosed: '语音会话已断开',
    busy: '已有语音会话在进行中，请稍后重试',
    transcribeFailed: '语音识别失败',
    statusFailed: '获取语音识别状态失败',
  },
});
registerTranslations('en', {
  asrClient: {
    agentNotPaired: 'Agent not paired, please complete pairing first',
    connectFailed: 'Voice session connect failed: {error}',
    sessionClosed: 'Voice session disconnected',
    busy: 'Another voice session is active, please retry later',
    transcribeFailed: 'Speech recognition failed',
    statusFailed: 'Failed to fetch speech recognition status',
  },
});

// ==================== 状态缓存 ====================

/** 状态缓存有效期：10s（侧边栏初始化/切换会话会重复请求） */
const STATUS_TTL_MS = 10_000;

let _statusCache = null;
let _statusCacheAt = 0;
let _statusInFlight = null;

/** 清空状态缓存（配对切换、安装完成、配置变更后调用） */
export function clearAsrStatusCache() {
  _statusCache = null;
  _statusCacheAt = 0;
  _statusInFlight = null;
}

/**
 * 读取代理端 ASR 状态（10s 缓存）
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<object|null>} 代理端响应（含 available/enabled/deps/modelsReady/reason…）
 */
export async function getAsrStatus(opts = {}) {
  const now = Date.now();
  if (!opts.force && _statusCache && now - _statusCacheAt < STATUS_TTL_MS) {
    return _statusCache;
  }
  if (!opts.force && _statusInFlight) return _statusInFlight;

  const run = (async () => {
    try {
      const res = await agentGet('/api/asr/status', 15_000);
      if (res && res.success === false) {
        logger.debug('[ASR] status unavailable:', res.error);
        return res;
      }
      _statusCache = res;
      _statusCacheAt = Date.now();
      return res;
    } catch (err) {
      logger.warn('[ASR] getAsrStatus failed:', err?.message || err);
      return null;
    } finally {
      _statusInFlight = null;
    }
  })();

  _statusInFlight = run;
  return run;
}

/**
 * 语音按钮是否应该出现 = 依赖就绪 AND 模型就绪 AND 用户开关打开
 * @param {object} [status] 已有的状态对象（省略则内部拉取）
 * @returns {Promise<boolean>}
 */
export async function isAsrUsable(status) {
  const s = status || (await getAsrStatus());
  return Boolean(s && s.success !== false && s.available === true);
}

// ==================== 一次性 HTTP 接口 ====================

/**
 * 整段转写（M1 最小闭环：录音 → 停止 → 整段转写）
 * @param {string} audioBase64 - WAV 文件 base64（无 data: 前缀）
 * @param {{language?: string, timeoutMs?: number}} [opts]
 */
export async function transcribeWavBase64(audioBase64, opts = {}) {
  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
    return { success: false, error: t('asrClient.transcribeFailed') };
  }
  return agentRequest(
    '/api/asr/transcribe',
    { audio: audioBase64, language: opts.language || 'auto' },
    'POST',
    opts.timeoutMs || 120_000
  );
}

/** 一键安装 sherpa-onnx-node（10 分钟级长任务，仅返回任务是否启动） */
export async function installAsrDeps() {
  const res = await agentRequest('/api/asr/deps/install', {}, 'POST', 30_000);
  clearAsrStatusCache();
  return res;
}

/** 安装任务进度（配置页 2s 轮询） */
export async function getAsrInstallStatus() {
  return agentGet('/api/asr/deps/install/status', 15_000);
}

/** 重新探测依赖（清缓存 + 子进程探测） */
export async function detectAsrDeps() {
  const res = await agentRequest('/api/asr/deps/detect', {}, 'POST', 30_000);
  clearAsrStatusCache();
  return res;
}

/** 更新 ASR 配置（enabled/language/streamingModelId/offlineModelId/idleUnloadMs） */
export async function updateAsrConfig(patch) {
  const res = await agentRequest('/api/asr/config', patch || {}, 'POST', 15_000);
  clearAsrStatusCache();
  return res;
}

/** 模型清单（verify=true 时校验 sha256，较慢） */
export async function listAsrModels(opts = {}) {
  const path = opts.verify ? '/api/asr/models?verify=1' : '/api/asr/models';
  return agentGet(path, opts.verify ? 120_000 : 20_000);
}

/** 重新扫描模型目录 */
export async function scanAsrModels() {
  const res = await agentRequest('/api/asr/models/scan', {}, 'POST', 60_000);
  clearAsrStatusCache();
  return res;
}

/** 弹出系统目录选择框并注册模型包（代理端仅允许 loopback） */
export async function pickAsrModelDir() {
  const res = await agentRequest('/api/asr/models/pick', {}, 'POST', 120_000);
  clearAsrStatusCache();
  return res;
}

/** 删除模型包 */
export async function deleteAsrModel(id) {
  const res = await agentRequest(`/api/asr/models/${encodeURIComponent(id)}`, {}, 'DELETE', 30_000);
  clearAsrStatusCache();
  return res;
}

/** 预热引擎（配置页「预热」按钮/启用开关时调用） */
export async function warmupAsrEngines() {
  return agentRequest('/api/asr/warmup', {}, 'POST', 180_000);
}

// ==================== 流式会话（WebSocket） ====================

/**
 * 由代理 URL 推导 ASR 会话 WebSocket 地址
 * @param {{url: string}} config
 * @param {string} sid
 * @param {string} language
 */
function buildAsrWsUrl(config, sid, language) {
  const u = new URL(config.url);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `/ws/asr/${encodeURIComponent(sid)}`;
  u.search = `?language=${encodeURIComponent(language || 'auto')}`;
  return u.toString();
}

/**
 * 打开一个流式语音会话。
 *
 * 代理端协议：
 *   客户端 → 代理端：{type:'start'} JSON 文本帧 / PCM16 二进制帧 / {type:'stop'} / {type:'cancel'}
 *   代理端 → 客户端：{type:'ready'|'partial'|'endpoint'|'final'|'error'}
 *
 * @param {{language?: string, onEvent?: (evt: object) => void}} opts
 * @returns {Promise<{sid: string, sendStart: Function, sendPcm: Function, stop: Function, cancel: Function, close: Function}>}
 */
export async function openAsrSession(opts = {}) {
  const config = await getAgentConfig();
  if (!config.connected) {
    throw new Error(t('asrClient.agentNotPaired'));
  }

  const language = opts.language || 'auto';
  const sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const wsUrl = buildAsrWsUrl(config, sid, language);

  let closedByUs = false;
  let settled = false;

  const ws = await new Promise((resolve, reject) => {
    createExecWebSocket(
      wsUrl,
      (data) => {
        if (!settled) settled = true;
        opts.onEvent?.(data);
      },
      () => {
        if (closedByUs) return;
        if (!settled) {
          settled = true;
          reject(new Error(t('asrClient.sessionClosed')));
          return;
        }
        opts.onEvent?.({ type: 'closed' });
      },
      (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(t('asrClient.connectFailed', { error: err?.message || String(err) })));
        } else {
          opts.onEvent?.({ type: 'error', code: 'ws_error', error: err?.message || String(err) });
        }
      }
    ).then((socket) => {
      if (!socket) {
        if (!settled) {
          settled = true;
          reject(new Error(t('asrClient.connectFailed', { error: t('asrClient.agentNotPaired') })));
        }
        return;
      }
      resolve(socket);
    }).catch((err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });

  const sendJson = (payload) => {
    try {
      if (ws.readyState === 1) ws.send(JSON.stringify(payload));
    } catch (err) {
      logger.debug('[ASR] send json failed:', err?.message || err);
    }
  };

  return {
    sid,
    /** 通知代理端开始（加载 online 模型，返回 ready{draft,finalize}） */
    sendStart: () => sendJson({ type: 'start', language }),
    /**
     * 发送一段 PCM16 音频（16k/mono）。
     * @param {ArrayBuffer|Uint8Array} chunk
     */
    sendPcm: (chunk) => {
      try {
        if (ws.readyState !== 1) return;
        const payload = chunk instanceof Uint8Array ? chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) : chunk;
        ws.send(payload);
      } catch (err) {
        logger.debug('[ASR] send pcm failed:', err?.message || err);
      }
    },
    /** 结束录音并请求定稿（代理端回 final 后主动 close） */
    stop: () => sendJson({ type: 'stop' }),
    /** 取消本次录音（不产出 final，草稿由调用方回滚） */
    cancel: () => {
      closedByUs = true;
      sendJson({ type: 'cancel' });
      try { ws.close(); } catch { /* 忽略 */ }
    },
    /** 仅关闭连接 */
    close: () => {
      closedByUs = true;
      try { ws.close(); } catch { /* 忽略 */ }
    },
    /** 底层 readyState（1=OPEN），便于调用方判断可用性 */
    get readyState() {
      return ws.readyState;
    },
  };
}

// ==================== base64 工具 ====================

/** base64 → Uint8Array（供 background 把面板上传的音频转成二进制帧） */
export function base64ToUint8(base64) {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default {
  getAsrStatus,
  isAsrUsable,
  clearAsrStatusCache,
  transcribeWavBase64,
  installAsrDeps,
  getAsrInstallStatus,
  detectAsrDeps,
  updateAsrConfig,
  listAsrModels,
  scanAsrModels,
  pickAsrModelDir,
  deleteAsrModel,
  warmupAsrEngines,
  openAsrSession,
  base64ToUint8,
};
