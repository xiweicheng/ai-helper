// agent/src/memory/routes.js - /api/memory/* 业务端点（认证与语言解析由 server.js 完成后转发）
// 零外部依赖：与 service 同进程，文件锁、session 召回缓存复用进程级单例。

import { createMemoryService } from './service.js';
import {
  resolveMemoryEmbeddingConfig,
  maskMemoryEmbeddingConfig,
  saveMemoryEmbeddingConfig,
  toEmbeddingProviderConfig
} from './embedding-config.js';
import { createEmbeddingProvider } from '../rag/embedding/index.js';

// 探活超时上限：语义通道绝不能拖垮调用方
const DEFAULT_EMBEDDING_TIMEOUT_MS = 8000;

// 进程级单例（默认路径 MEMORY_DIR/global-memory.json）
const defaultService = createMemoryService();

// 子路径 → service 方法映射
const ROUTE_METHODS = {
  store: 'store',
  recall: 'recall',
  manage: 'manage',
  inject: 'injectSelect',
  // 重建向量缓存：派生缓存的显式重建入口（模型变更/首次启用语义通道后调一次）
  reindex: 'backfillVectors'
};

/**
 * 判断请求来源是否允许跨域读取响应（与 server.js 的 getAllowedOrigin 行为一致）
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
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
 * embed 调用超时保护。到期后必须 clearTimeout：否则 daemon 里每调一次就多挂一个定时器，
 * 测试进程也会因为残留句柄延迟退出。
 */
function withTimeout(promise, ms) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('embedding_timeout')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/**
 * 记忆 embedding 的配置/探活端点。配置类不走 ROUTE_METHODS，也不受「非 POST 即 404」约束
 * （GET 是合法读操作）；返回 true 表示已响应，false 则继续走业务分发/404。
 * @param {{createProvider?: Function, embeddingTimeoutMs?: number}} [options] 测试接缝：注入假 provider
 */
async function handleEmbeddingEndpoints(req, res, key, t, requestBody, options = {}) {
  const body = requestBody || {};

  if (key === 'embedding-config') {
    if (req.method === 'GET') {
      jsonResponse(res, 200, { success: true, config: maskMemoryEmbeddingConfig() });
      return true;
    }
    if (req.method === 'POST') {
      try {
        const config = await saveMemoryEmbeddingConfig(body);
        jsonResponse(res, 200, { success: true, config });
      } catch (err) {
        const error = err.message === 'invalid_embedding_mode'
          ? t('memory.invalidEmbeddingMode')
          : (err.message || 'embedding_config_error');
        jsonResponse(res, 400, { success: false, error });
      }
      return true;
    }
    return false;
  }

  if (key === 'test-embedding') {
    if (req.method !== 'POST') return false;
    // 允许用请求体覆盖尚未保存的草稿配置，明文 key 缺省时回落已存 key
    const cfg = resolveMemoryEmbeddingConfig(body);
    const createProvider = options.createProvider || createEmbeddingProvider;
    const timeoutMs = Number(options.embeddingTimeoutMs) > 0
      ? Number(options.embeddingTimeoutMs)
      : DEFAULT_EMBEDDING_TIMEOUT_MS;
    try {
      const provider = createProvider(toEmbeddingProviderConfig(cfg));
      const vec = await withTimeout(Promise.resolve(provider.embedQuery('ping')), timeoutMs);
      jsonResponse(res, 200, { success: true, dimensions: Array.isArray(vec) ? vec.length : 0 });
    } catch (err) {
      jsonResponse(res, 400, { success: false, error: err.message || 'embedding_test_failed' });
    }
    return true;
  }

  // 只读状态：条数 + 指纹陈旧。走 GET（配置类端点同例，不受「非 POST 即 404」约束）。
  // 放在这里而不是 ROUTE_METHODS：后者只收 POST 业务动作，且需要请求体。
  if (key === 'vector-status') {
    if (req.method !== 'GET') return false;
    const service = options.service || defaultService;
    try {
      const data = await service.vectorStatus();
      if (data && data.success === false) {
        jsonResponse(res, 400, data);
      } else {
        jsonResponse(res, 200, { success: true, ...data });
      }
    } catch (err) {
      jsonResponse(res, 400, { success: false, error: err.message || 'vector_status_failed' });
    }
    return true;
  }

  return false;
}

/**
 * /api/memory/* 分发
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} pathname 形如 /api/memory/store
 * @param {URL} url
 * @param {(key: string, params?: object) => string} t 请求级翻译函数
 * @param {object} requestBody 已解析的请求体
 * @param {{service?: object}} [options] 可注入 service 实例（测试用），缺省使用进程级单例
 */
export async function memoryDispatch(req, res, pathname, url, t, requestBody = {}, options = {}) {
  const service = options.service || defaultService;
  const key = pathname.slice('/api/memory/'.length).replace(/\/+$/, '');
  const method = ROUTE_METHODS[key];

  // 配置与探活端点先分流（GET 合法，且不进业务 404 判定）
  if (await handleEmbeddingEndpoints(req, res, key, t, requestBody, options)) return;

  // 404 仅表示路径/方法不匹配（扩展端据此探测旧版本 agent 无记忆端点）
  if (!method || req.method !== 'POST') {
    return jsonResponse(res, 404, { success: false, error: t('error.unknownApiPath') });
  }

  const body = requestBody || {};
  // P1-3：记忆来源以 HTTP header 为权威——模型只能控制 body（经 tool-memory.js 原样透传），
  // 控制不了 background 发请求时的 header；仅 options 面板的 agentApi 会带 X-Memory-Caller: user。
  const callerOrigin = String(req?.headers?.['x-memory-caller'] || '').toLowerCase() === 'user' ? 'user' : 'model';

  try {
    let data;
    if (method === 'recall') {
      data = await service.recall(body, body.sessionId ?? null, t);
    } else if (method === 'injectSelect') {
      data = await service.injectSelect(t);
    } else if (method === 'backfillVectors') {
      // 不接受请求体：只做「按当前配置把全部记忆补进向量缓存」，t 用于渲染跳过原因
      data = await service.backfillVectors(t);
    } else if (method === 'store') {
      // P1-3：store 传入可信 ctx（源于上面的 header 判定），忽略 body 里模型可伪造的 origin
      data = await service.store(body, t, { origin: callerOrigin });
    } else {
      data = await service[method](body, t);
    }

    // 业务失败（参数缺失、文件读写失败）：HTTP 400 + 原样 error，扩展端仍读 body
    if (data && data.success === false) {
      return jsonResponse(res, 400, data);
    }
    return jsonResponse(res, 200, { success: true, ...data });
  } catch (err) {
    console.error('[Memory] route error:', err);
    return jsonResponse(res, 400, { success: false, error: err.message || 'memory_error' });
  }
}

/**
 * server.js 接线入口（签名与 ragRouter 一致）
 */
export async function memoryRouter(req, res, pathname, url, t, requestBody) {
  return memoryDispatch(req, res, pathname, url, t, requestBody);
}
