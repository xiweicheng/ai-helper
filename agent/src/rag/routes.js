// agent/src/rag/routes.js - RAG HTTP 路由模块（按需加载）
// 仅在 RAG 依赖可用且收到 /api/rag/* 请求时，才被 server.js 动态 import。
// 认证与「依赖可用性检查」已由 server.js 在调用前完成；
// body 由 server.js 的通用 JSON 解析提供（POST/PUT/DELETE 请求，见 server.js 的 requestBody 传递）。
//
// 接口清单（见设计文档七）：
//   GET    /api/rag/status                       能力与安装状态
//   POST   /api/rag/test-embedding               测试远端向量服务连通性（返回实际维度）
//   GET    /api/rag/collections                  列出知识库
//   POST   /api/rag/collections                  创建知识库
//   PUT    /api/rag/collections/{id}             更新知识库名称/描述/向量配置（向量空间变更自动重建索引）
//   DELETE /api/rag/collections/{id}             删除知识库
//   GET    /api/rag/collections/{id}/stats       文档数/分块数统计
//   POST   /api/rag/collections/{id}/ingest      导入文档（text/file/url；同步执行）
//   GET    /api/rag/collections/{id}/ingest/status 导入进度快照（供导入弹窗轮询）
//   GET    /api/rag/collections/{id}/documents   文档列表
//   DELETE /api/rag/collections/{id}/documents/{docId}  删除文档
//   POST   /api/rag/collections/{id}/search      检索
//   POST   /api/rag/search                       跨知识库检索

import { isRagAvailable } from './detect.js';
import { getRagInstallStatus } from './install.js';
import { RagManager, resolveEmbeddingConfig, validateEmbeddingConfig } from './manager.js';
import { createEmbeddingProvider } from './embedding/index.js';
import { RagError, translateRagError } from './errors.js';

// 进程级单例（注册表锁与 provider 缓存复用）
const manager = new RagManager();

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
 * 业务处理包装：统一错误响应（RagError 按当前请求语言翻译，其余 400 原样返回）
 */
async function handleWithT(res, t, fn) {
  try {
    const data = await fn();
    return jsonResponse(res, 200, { success: true, ...data });
  } catch (err) {
    if (!(err instanceof RagError)) {
      console.error('[RAG] route error:', err);
    }
    const { error, code } = translateRagError(err, t);
    return jsonResponse(res, 400, { success: false, error, code });
  }
}

/**
 * 响应脱敏：隐藏 embeddingConfig.apiKey 明文（前端不回显），附 hasApiKey 标记供「已配置」提示；
 * 仅响应层脱敏，manager 内部逻辑仍读取原对象真实密钥
 */
export function sanitizeCollection(collection) {
  if (!collection || typeof collection !== 'object') return collection;
  const cfg = collection.embeddingConfig && typeof collection.embeddingConfig === 'object'
    ? collection.embeddingConfig
    : {};
  const { apiKey, ...rest } = cfg;
  return { ...collection, embeddingConfig: { ...rest, apiKey: '', hasApiKey: Boolean(apiKey) } };
}

/**
 * 解析 test-embedding 请求体：apiKey 留空（响应脱敏后前端不回显明文）时，
 * 编辑场景经 collectionId 复用该库已保存的密钥；collectionId 不混入向量配置
 * @param {object} payload - 请求体
 * @returns {Promise<object>} 可交给 resolveEmbeddingConfig 的配置
 */
export async function resolveTestEmbeddingInput(payload = {}) {
  const { collectionId, ...rest } = payload;
  let apiKey = rest.apiKey;
  if ((apiKey === undefined || String(apiKey).trim() === '') && collectionId) {
    const saved = await manager.getCollection(String(collectionId));
    apiKey = saved.embeddingConfig?.apiKey || '';
  }
  return { ...rest, apiKey };
}

/**
 * RAG 路由入口（由 server.js 动态 import 后调用；此时已通过认证与依赖可用性检查）
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} pathname - 请求路径
 * @param {URL} url - 已解析的 URL（含 query）
 * @param {Function} t - 请求级翻译函数
 * @param {object} [body] - 已解析的 JSON body（GET 请求为 null）
 */
export async function ragRouter(req, res, pathname, url, t, body = {}) {
  const method = req.method;
  const payload = body || {};
  // 业务处理包装（绑定请求级翻译函数）
  const handle = (r, fn) => handleWithT(r, t, fn);

  // GET /api/rag/status - RAG 能力与安装状态
  if (method === 'GET' && pathname === '/api/rag/status') {
    return jsonResponse(res, 200, {
      success: true,
      available: isRagAvailable(),
      install: getRagInstallStatus(),
    });
  }

  // POST /api/rag/test-embedding - 测试远端向量服务连通性（用配置真实调用一次接口探测维度）
  if (method === 'POST' && pathname === '/api/rag/test-embedding') {
    return handle(res, async () => {
      const config = resolveEmbeddingConfig(await resolveTestEmbeddingInput(payload), null);
      if (config.mode !== 'openai-compat') {
        throw new RagError('invalidEmbeddingMode', { mode: String(config.mode) });
      }
      validateEmbeddingConfig(config);
      const provider = createEmbeddingProvider(config);
      const [vec] = await provider.embedDocuments(['连接测试 connection test']);
      if (!Array.isArray(vec) || vec.length === 0) {
        throw new Error('Embedding endpoint returned empty vector');
      }
      return { mode: config.mode, model: config.modelName, dimensions: vec.length };
    });
  }

  // GET /api/rag/collections - 列出知识库
  if (method === 'GET' && pathname === '/api/rag/collections') {
    return handle(res, async () => ({ collections: (await manager.listCollections()).map(sanitizeCollection) }));
  }

  // POST /api/rag/collections - 创建知识库
  if (method === 'POST' && pathname === '/api/rag/collections') {
    return handle(res, async () => ({ collection: sanitizeCollection(await manager.createCollection(payload)) }));
  }

  // POST /api/rag/search - 跨知识库检索
  if (method === 'POST' && pathname === '/api/rag/search') {
    return handle(res, async () => {
      const ids = Array.isArray(payload.collectionIds) ? payload.collectionIds : [];
      const query = payload.query;
      const options = { topK: payload.topK, threshold: payload.threshold };
      if (ids.length > 0) return manager.searchMulti(ids, query, options);
      // 未指定则搜索全部
      const all = await manager.listCollections();
      return manager.searchMulti(all.map(c => c.id), query, options);
    });
  }

  // /api/rag/collections/{id}[/{sub}[/{docId}]]
  const collectionMatch = pathname.match(
    /^\/api\/rag\/collections\/([^/]+)(?:\/(stats|ingest|documents|search)(?:\/([^/]+))?)?$/
  );

  if (collectionMatch) {
    const collectionId = decodeURIComponent(collectionMatch[1]);
    const sub = collectionMatch[2];
    const docId = collectionMatch[3] ? decodeURIComponent(collectionMatch[3]) : undefined;

    // DELETE /api/rag/collections/{id} - 删除知识库
    if (method === 'DELETE' && !sub) {
      return handle(res, async () => manager.deleteCollection(collectionId));
    }

    // PUT /api/rag/collections/{id} - 更新知识库名称/描述/向量配置（向量空间变更触发后台重建）
    if (method === 'PUT' && !sub) {
      return handle(res, async () => ({ collection: sanitizeCollection(await manager.updateCollection(collectionId, payload)) }));
    }

    // GET /api/rag/collections/{id}/stats
    if (method === 'GET' && sub === 'stats') {
      return handle(res, async () => ({ stats: await manager.getStats(collectionId) }));
    }

    // POST /api/rag/collections/{id}/ingest - 导入文档（同步执行；执行期间进度经 /ingest/status 旁路轮询）
    if (method === 'POST' && sub === 'ingest' && !docId) {
      return handle(res, async () => {
        const { type } = payload;
        const common = { metadata: payload.metadata, chunkConfig: payload.chunkConfig };
        if (type === 'text') {
          return manager.ingestText(collectionId, { content: payload.content, name: payload.name, ...common });
        }
        if (type === 'file') {
          return manager.ingestFile(collectionId, {
            path: payload.path,
            fileName: payload.fileName,
            contentBase64: payload.contentBase64,
            ...common,
          });
        }
        if (type === 'url') {
          return manager.ingestUrl(collectionId, { url: payload.url, ...common });
        }
        throw new RagError('unsupportedType', { type: String(type) });
      });
    }

    // GET /api/rag/collections/{id}/ingest/status - 导入进度快照（供导入弹窗轮询；无任务时 progress 为 null）
    if (method === 'GET' && sub === 'ingest' && docId === 'status') {
      return jsonResponse(res, 200, { success: true, progress: manager.getIngestProgress(collectionId) });
    }

    // GET /api/rag/collections/{id}/documents - 文档列表
    if (method === 'GET' && sub === 'documents' && !docId) {
      return handle(res, async () => ({ documents: await manager.listDocuments(collectionId) }));
    }

    // DELETE /api/rag/collections/{id}/documents/{docId} - 删除文档
    if (method === 'DELETE' && sub === 'documents' && docId) {
      return handle(res, async () => manager.deleteDocument(collectionId, docId));
    }

    // POST /api/rag/collections/{id}/search - 检索
    if (method === 'POST' && sub === 'search') {
      return handle(res, async () => manager.search(collectionId, payload.query, {
        topK: payload.topK,
        threshold: payload.threshold,
      }));
    }
  }

  // 未匹配的 RAG 路径
  jsonResponse(res, 404, { success: false, error: t('error.unknownApiPath') });
}
