// agent/src/memory/routes.js - /api/memory/* 业务端点（认证与语言解析由 server.js 完成后转发）
// 零外部依赖：与 service 同进程，文件锁、session 召回缓存复用进程级单例。

import { createMemoryService } from './service.js';

// 进程级单例（默认路径 MEMORY_DIR/global-memory.json）
const defaultService = createMemoryService();

// 子路径 → service 方法映射
const ROUTE_METHODS = {
  store: 'store',
  recall: 'recall',
  manage: 'manage',
  inject: 'injectSelect'
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

  // 404 仅表示路径/方法不匹配（扩展端据此探测旧版本 agent 无记忆端点）
  if (!method || req.method !== 'POST') {
    return jsonResponse(res, 404, { success: false, error: t('error.unknownApiPath') });
  }

  const body = requestBody || {};

  try {
    let data;
    if (method === 'recall') {
      data = await service.recall(body, body.sessionId ?? null, t);
    } else if (method === 'injectSelect') {
      data = await service.injectSelect(t);
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
