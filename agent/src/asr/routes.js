// agent/src/asr/routes.js - /api/asr/* 业务端点（认证由 server.js 完成后转发）
//
// 端点清单：
//   GET    /api/asr/status              能力/依赖/模型/配置/安装进度（依赖缺失时也可访问）
//   POST   /api/asr/config              更新配置（enabled / language / 模型选择 / 空闲卸载）
//   GET    /api/asr/models              列出已安装模型（含非法包原因）
//   POST   /api/asr/models/scan         重新扫描（?verify=1 时校验 sha256）
//   POST   /api/asr/models/pick         本机原生目录选择 → 注册模型包（仅 loopback）
//   GET    /api/asr/models/catalog      推荐模型清单（含是否已安装）
//   POST   /api/asr/models/download     一键下载推荐模型（body: { ids?: string[] }）
//   GET    /api/asr/models/download/status 下载进度
//   POST   /api/asr/models/download/cancel 取消下载
//   DELETE /api/asr/models/{id}         删除模型包
//   POST   /api/asr/transcribe          base64(WAV) → 文本（整段定稿；需依赖可用）
//   POST   /api/asr/warmup              预热引擎（需依赖可用）
//
// 依赖缺失时仍可访问 status/config/models —— 配置页要展示「缺哪一环」，不能整体 503。

import { pickDirectoryNative } from '../directory-picker.js';
import { logError, logSystem } from '../logger.js';
import { getAsrConfig, saveAsrConfig, SUPPORTED_LANGUAGES, MAX_RECORDING_MS, MODELS_DIR, getModelsDirDisplay } from './config.js';
import { scanModels, registerModel, deleteModel, pickModel, getCapability, normalizeModelId } from './model-pack.js';
import { detectAsrAvailable, resetAsrDetection, getLastAsrProbeError, getAsrProbeVersion, hasAsrPackageOnDisk } from './detect.js';
import { getAsrInstallStatus } from './install.js';
import { toPublicCatalog } from './model-catalog.js';
import { startModelDownload, stopModelDownload, getModelDownloadStatus } from './model-download.js';
import { getLoadedEngineInfo } from './engine.js';
import { runOfflineTask, warmupAsrEngines, getWorkerLoadedModelId } from './offline-pool.js';

// transcribe 请求体上限（base64 后约 1.33 倍；5min @16k mono PCM16 ≈ 9.6MB，留足余量）
const MAX_AUDIO_BASE64_CHARS = 40 * 1024 * 1024;

// 不需要依赖可用即可访问的路径（配置页展示与模型管理）
const DEPS_INDEPENDENT_PREFIXES = [
  '/api/asr/status',
  '/api/asr/config',
  '/api/asr/models',
];

/**
 * 判断请求来源是否允许跨域读取响应（与 server.js 的 getAllowedOrigin 一致）
 */
function getAllowedOrigin(req) {
  const origin = req?.headers?.origin;
  if (typeof origin === 'string' && origin.startsWith('chrome-extension://')) {
    return origin;
  }
  return null;
}

/**
 * JSON 响应辅助（与 server.js 的 jsonResponse 行为一致）
 */
function jsonResponse(res, status, data) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
  const allowedOrigin = getAllowedOrigin(res.req);
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

/**
 * 该路径是否可以在依赖缺失时继续处理
 * @param {string} pathname
 * @returns {boolean}
 */
export function isDepsIndependentPath(pathname) {
  return DEPS_INDEPENDENT_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 判断请求是否来自本机（目录选择器只对本机有意义）
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
function isLocalRequest(req) {
  const ip = req?.socket?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

/**
 * 当前可用模型三元组（按配置里的显式选择优先，否则取该类第一个包）
 * @returns {{ online: object|null, offline: object|null, vad: object|null, models: object[], invalid: object[] }}
 */
export function resolveAsrModels() {
  const config = getAsrConfig();
  const { models, invalid } = scanModels();
  return {
    online: pickModel(models, 'online', config.streamingModelId),
    offline: pickModel(models, 'offline', config.offlineModelId),
    vad: pickModel(models, 'vad', null),
    models,
    invalid,
  };
}

/**
 * 汇总对外状态（配置页/侧边栏共用同一份判定）
 * @returns {Promise<object>}
 */
async function buildStatus(t) {
  const config = getAsrConfig();
  const depsReady = await detectAsrAvailable();
  const resolved = resolveAsrModels();
  const capability = {
    online: Boolean(resolved.online),
    offline: Boolean(resolved.offline),
    vad: Boolean(resolved.vad),
  };
  const modelsReady = capability.offline || capability.online;
  // 三者全真才允许向 UI 暴露 🎤 按钮（避免"装了就该能用"的误解）
  const available = depsReady && modelsReady && config.enabled;
  // offline 引擎现在常驻 worker 线程，主线程看不到它；补上 worker 侧的真实状态
  const loaded = getLoadedEngineInfo();
  if (!loaded.offline) loaded.offline = getWorkerLoadedModelId();

  return {
    success: true,
    available,
    enabled: config.enabled,
    language: config.language,
    languages: SUPPORTED_LANGUAGES,
    maxRecordingMs: MAX_RECORDING_MS,
    deps: {
      ready: depsReady,
      packageOnDisk: hasAsrPackageOnDisk(),
      version: getAsrProbeVersion(),
      error: depsReady ? null : getLastAsrProbeError(),
      everInstalled: getAsrInstallStatus().everSucceeded === true,
    },
    modelsReady,
    capability,
    // 模型存放位置固定（不可选）：配置页要把它展示给用户，内网无网时按这个路径拷贝
    modelsDir: MODELS_DIR,
    modelsDirDisplay: getModelsDirDisplay(),
    models: resolved.models.map(toPublicModel),
    invalidModels: resolved.invalid,
    selected: {
      online: resolved.online ? resolved.online.id : null,
      offline: resolved.offline ? resolved.offline.id : null,
      vad: resolved.vad ? resolved.vad.id : null,
    },
    loaded,
    install: getAsrInstallStatus(),
    // 推荐模型下载：清单 + 任务快照（配置页一次拿到，不用额外请求）
    catalog: toPublicCatalog({ installedIds: resolved.models.map((m) => m.id) }),
    download: getModelDownloadStatus(),
    // 缺失环节的可读原因（前端状态块逐项展示）
    reason: available
      ? null
      : (!depsReady ? 'deps_missing' : (!modelsReady ? 'models_missing' : 'disabled')),
  };
}

/**
 * 模型对外视图（隐藏本机绝对路径）
 * @param {object} model
 */
function toPublicModel(model) {
  return {
    id: model.id,
    name: model.name,
    kind: model.kind,
    arch: model.arch,
    language: model.language,
    sampleRate: model.sampleRate,
    totalBytes: model.totalBytes,
    files: model.files,
  };
}

/**
 * /api/asr/* 分发
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} pathname
 * @param {URL} url
 * @param {(key: string, params?: object) => string} t
 * @param {object} requestBody
 */
export async function asrRouter(req, res, pathname, url, t, requestBody = {}) {
  const body = requestBody || {};

  if (req.method === 'GET' && pathname === '/api/asr/status') {
    return jsonResponse(res, 200, await buildStatus(t));
  }

  if (req.method === 'POST' && pathname === '/api/asr/config') {
    try {
      const patch = {};
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      if (typeof body.language === 'string') patch.language = body.language;
      if (body.streamingModelId === null || typeof body.streamingModelId === 'string') {
        patch.streamingModelId = body.streamingModelId === null ? null : normalizeModelId(body.streamingModelId);
      }
      if (body.offlineModelId === null || typeof body.offlineModelId === 'string') {
        patch.offlineModelId = body.offlineModelId === null ? null : normalizeModelId(body.offlineModelId);
      }
      if (body.idleUnloadMs !== undefined) patch.idleUnloadMs = Number(body.idleUnloadMs);

      const config = saveAsrConfig(patch);
      logSystem('asr_config_update', { enabled: config.enabled, language: config.language });
      return jsonResponse(res, 200, { success: true, config });
    } catch (err) {
      logError('system', 'asr_config_save_failed', { error: err.message });
      return jsonResponse(res, 400, { success: false, error: err.message || 'config_save_failed' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/asr/models') {
    const verify = url.searchParams.get('verify') === '1';
    const capability = getCapability({ verifyHash: verify });
    return jsonResponse(res, 200, {
      success: true,
      models: capability.models.map(toPublicModel),
      invalid: capability.invalid,
      capability: { online: capability.online, offline: capability.offline, vad: capability.vad },
    });
  }

  if (req.method === 'POST' && pathname === '/api/asr/models/scan') {
    resetAsrDetection();
    const verify = body.verify === true || url.searchParams.get('verify') === '1';
    const capability = getCapability({ verifyHash: verify });
    return jsonResponse(res, 200, {
      success: true,
      models: capability.models.map(toPublicModel),
      invalid: capability.invalid,
      capability: { online: capability.online, offline: capability.offline, vad: capability.vad },
    });
  }

  // 本机原生目录选择 → 注册模型包（零上传：只在本机文件系统内拷贝）
  if (req.method === 'POST' && pathname === '/api/asr/models/pick') {
    if (!isLocalRequest(req)) {
      logError('system', 'asr_pick_remote_blocked', { remote: req?.socket?.remoteAddress || '' });
      return jsonResponse(res, 200, { success: false, available: false, error: 'remote-source' });
    }
    // 与 /api/config/pick-directory 一致：等用户选目录期间客户端可能已断开，
    // 向已销毁的 res 写入会抛流错误，统一走安全响应
    const respond = (payload) => {
      if (res.writableEnded || res.destroyed) return;
      try { jsonResponse(res, 200, payload); } catch (err) {
        try { logError('system', 'asr_pick_respond_failed', { error: err.message }); } catch { /* 忽略 */ }
      }
    };
    try {
      const picked = await pickDirectoryNative(t('asr.pickModelDirTitle'));
      if (!picked.success || !picked.path) {
        return respond(picked);
      }
      const registered = registerModel(picked.path, { verifyHash: body.verifyHash === true });
      if (!registered.success) {
        logError('system', 'asr_model_register_failed', { error: registered.error, path: picked.path });
        return respond({ success: false, error: t('asr.modelInvalid', { reason: registered.error }) });
      }
      logSystem('asr_model_registered', { id: registered.model.id, kind: registered.model.kind });
      return respond({
        success: true,
        model: toPublicModel(registered.model),
        reused: registered.reused === true,
      });
    } catch (err) {
      logError('system', 'asr_pick_error', { error: err.message });
      return respond({ success: false, available: true, error: err.message });
    }
  }

  // 推荐模型下载：失败要能降级为「模型未安装」状态，因此与 status 一样不受依赖可用性限制
  if (req.method === 'POST' && pathname === '/api/asr/models/download') {
    const result = startModelDownload(Array.isArray(body.ids) ? body.ids : null, t);
    if (result.started) logSystem('asr_model_download', { reason: 'api_request', ids: (result.ids || []).join(',') });
    // 已在下载 = 幂等重入，回 200；前端据此接上进度轮询而不是报错
    return jsonResponse(res, 200, result);
  }

  if (req.method === 'GET' && pathname === '/api/asr/models/download/status') {
    return jsonResponse(res, 200, getModelDownloadStatus());
  }

  if (req.method === 'POST' && pathname === '/api/asr/models/download/cancel') {
    const stopped = stopModelDownload();
    logSystem('asr_model_download_cancel', { stopped });
    return jsonResponse(res, 200, { success: true, stopped });
  }

  if (req.method === 'GET' && pathname === '/api/asr/models/catalog') {
    const { models } = scanModels();
    return jsonResponse(res, 200, {
      success: true,
      models: toPublicCatalog({ installedIds: models.map((m) => m.id) }),
    });
  }

  const deleteMatch = pathname.match(/^\/api\/asr\/models\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    let id;
    try {
      id = decodeURIComponent(deleteMatch[1]);
    } catch {
      return jsonResponse(res, 400, { success: false, error: t('asr.invalidModelId', { id: deleteMatch[1] }) });
    }
    const result = deleteModel(id);
    if (!result.success) {
      return jsonResponse(res, 400, { success: false, error: result.error });
    }
    logSystem('asr_model_deleted', { id });
    return jsonResponse(res, 200, { success: true });
  }

  // ---- 以下端点需要依赖可用（server.js 已做 503 前置判断，这里再兜一层）----
  if (pathname === '/api/asr/transcribe') {
    if (req.method !== 'POST') {
      return jsonResponse(res, 404, { success: false, error: t('error.unknownApiPath') });
    }
    const audio = typeof body.audio === 'string' ? body.audio : '';
    if (!audio) {
      return jsonResponse(res, 400, { success: false, error: t('asr.emptyAudio') });
    }
    if (audio.length > MAX_AUDIO_BASE64_CHARS) {
      return jsonResponse(res, 413, { success: false, error: t('asr.audioTooLarge') });
    }
    let buffer;
    try {
      buffer = Buffer.from(audio, 'base64');
    } catch {
      return jsonResponse(res, 400, { success: false, error: t('asr.invalidAudio') });
    }
    if (buffer.length === 0) {
      return jsonResponse(res, 400, { success: false, error: t('asr.emptyAudio') });
    }

    const config = getAsrConfig();
    const resolved = resolveAsrModels();
    if (!resolved.offline) {
      return jsonResponse(res, 409, { success: false, code: 'model_missing', error: t('asr.modelMissing') });
    }

    try {
      // offline 定稿在 worker 线程里跑：HTTP 请求等待期间主线程仍能响应探活/聊天流
      const result = await runOfflineTask({
        kind: 'wav',
        buffer,
        opts: {
          offlineModel: resolved.offline,
          vadModel: resolved.vad,
          language: config.language,
          idleUnloadMs: config.idleUnloadMs,
        },
        idleMs: config.idleUnloadMs,
        modelId: resolved.offline.id,
      });
      return jsonResponse(res, 200, { success: true, text: result.text, durationMs: result.durationMs });
    } catch (err) {
      if (err.code === 'unsupported_audio') {
        return jsonResponse(res, 400, { success: false, code: 'unsupported_audio', error: t('asr.unsupportedAudio') });
      }
      if (err.code === 'model_missing') {
        return jsonResponse(res, 409, { success: false, code: 'model_missing', error: t('asr.modelMissing') });
      }
      logError('system', 'asr_transcribe_failed', { error: err.message });
      return jsonResponse(res, 500, { success: false, code: 'internal', error: t('asr.transcribeFailed') });
    }
  }

  if (req.method === 'POST' && pathname === '/api/asr/warmup') {
    const resolved = resolveAsrModels();
    if (!resolved.online && !resolved.offline) {
      return jsonResponse(res, 409, { success: false, code: 'model_missing', error: t('asr.modelMissing') });
    }
    const config = getAsrConfig();
    const result = await warmupAsrEngines(resolved, { idleUnloadMs: config.idleUnloadMs });
    logSystem('asr_warmup', { warmed: result.warmed, failed: result.failed.length });
    return jsonResponse(res, 200, { success: true, ...result });
  }

  return jsonResponse(res, 404, { success: false, error: t('error.unknownApiPath') });
}
