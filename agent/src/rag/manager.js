// agent/src/rag/manager.js - RagManager：知识库生命周期管理（增删改查/导入/检索）
// 职责：
//   - collections.json 注册表读写（互斥更新，防并发写坏）
//   - 知识库创建/删除/查询
//   - 文档导入（文本/文件/URL）→ 解析 → 分块 → 向量化 → 写入 Vectra → 原文备份
//   - 文档删除/列表/统计
//   - 检索（以知识库注册表中的 embedding 配置为准，保证链路一致性）
// 存储布局见 config.js / 设计文档 5.2

import { join, extname } from 'path';
import { tmpdir } from 'os';
import { mkdir, readFile, writeFile, rm, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import {
  RAG_ROOT, COLLECTIONS_REGISTRY, COLLECTION_ID_PREFIX,
  DEFAULT_EMBEDDING_CONFIG, DEFAULT_CHUNK_CONFIG, EMBED_BATCH_SIZE,
} from './config.js';
import { createEmbeddingProvider } from './embedding/index.js';
import { VectraStore } from './store/vectra.js';
import { chunkText } from './document/chunker.js';
import { loadDocument } from './document/loader.js';
import { htmlToText } from './document/parsers/html.js';
import { Searcher } from './searcher.js';
import { RagError } from './errors.js';

// 知识库 ID 格式校验（防路径穿越）
const COLLECTION_ID_RE = /^kb_[a-z0-9]+$/;
const DOCUMENT_ID_RE = /^doc_[a-z0-9]+$/;

export class RagManager {
  constructor() {
    // 注册表写互斥锁（Promise 链）
    this._registryLock = Promise.resolve();
    // embedding provider 缓存（key: collectionId；本地 pipeline 单例在 embedding/local.js）
    this._providers = new Map();
  }

  // ==================== 注册表 ====================

  async _loadRegistry() {
    try {
      const raw = await readFile(COLLECTIONS_REGISTRY, 'utf-8');
      const reg = JSON.parse(raw);
      if (!Array.isArray(reg.collections)) reg.collections = [];
      return reg;
    } catch {
      return { version: 1, collections: [] };
    }
  }

  /**
   * 互斥更新注册表（读-改-写串行化）
   * @param {(reg: object) => object|void} mutator
   */
  async _updateRegistry(mutator) {
    const run = this._registryLock.then(async () => {
      const reg = await this._loadRegistry();
      const out = mutator(reg) || reg;
      await mkdir(RAG_ROOT, { recursive: true });
      await writeFile(COLLECTIONS_REGISTRY, JSON.stringify(out, null, 2), 'utf-8');
      return out;
    });
    this._registryLock = run.catch(() => {});
    return run;
  }

  /**
   * 列出所有知识库
   */
  async listCollections() {
    const reg = await this._loadRegistry();
    return reg.collections;
  }

  /**
   * 获取单个知识库（不存在时抛错）
   */
  async getCollection(collectionId) {
    this._assertCollectionId(collectionId);
    const reg = await this._loadRegistry();
    const found = reg.collections.find(c => c.id === collectionId);
    if (!found) throw new RagError('collectionNotFound', { id: collectionId });
    return found;
  }

  _assertCollectionId(collectionId) {
    if (typeof collectionId !== 'string' || !COLLECTION_ID_RE.test(collectionId)) {
      throw new RagError('invalidCollectionId', { id: String(collectionId) });
    }
  }

  // ==================== 知识库生命周期 ====================

  /**
   * 创建知识库
   * @param {{name: string, description?: string, embeddingConfig?: object, chunkConfig?: object}} input
   */
  async createCollection(input = {}) {
    const name = String(input.name || '').trim();
    if (!name) throw new RagError('nameRequired');

    const id = `${COLLECTION_ID_PREFIX}${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    const entry = {
      id,
      name: name.slice(0, 100),
      description: String(input.description || '').slice(0, 500),
      // embedding 配置随库快照（链路一致性：导入与检索使用同一模型）
      embeddingConfig: { ...DEFAULT_EMBEDDING_CONFIG, ...(input.embeddingConfig || {}) },
      chunkConfig: { ...DEFAULT_CHUNK_CONFIG, ...(input.chunkConfig || {}) },
      createdAt: new Date().toISOString(),
      documentCount: 0,
      chunkCount: 0,
    };

    // 先建目录与索引，再写注册表（注册表写入失败时目录为空壳，可人工清理）
    const store = new VectraStore(id);
    await store.ensureCreated();
    await mkdir(join(RAG_ROOT, id, 'documents'), { recursive: true });

    await this._updateRegistry(reg => {
      reg.collections.push(entry);
      return reg;
    });
    return entry;
  }

  /**
   * 删除知识库（索引目录 + 注册表条目）
   */
  async deleteCollection(collectionId) {
    await this.getCollection(collectionId); // 校验存在性
    // 防路径穿越：ID 已通过正则校验，目录路径安全
    await rm(join(RAG_ROOT, collectionId), { recursive: true, force: true });
    this._providers.delete(collectionId);
    await this._updateRegistry(reg => {
      reg.collections = reg.collections.filter(c => c.id !== collectionId);
      return reg;
    });
    return { deleted: true, id: collectionId };
  }

  // ==================== embedding provider ====================

  _getProvider(collection) {
    if (!this._providers.has(collection.id)) {
      // 以注册表中的快照配置创建（导入与检索链路一致）
      this._providers.set(collection.id, createEmbeddingProvider(collection.embeddingConfig));
    }
    return this._providers.get(collection.id);
  }

  // ==================== 文档导入 ====================

  /**
   * 导入文本内容
   * @param {string} collectionId
   * @param {{content: string, name?: string, metadata?: object, chunkConfig?: object}} input
   * @returns {Promise<{documentId: string, name: string, chunkCount: number}>}
   */
  async ingestText(collectionId, input = {}) {
    const content = String(input.content || '');
    if (!content.trim()) throw new RagError('emptyContent');
    return this._ingestText(collectionId, {
      text: content,
      name: input.name || `text_${new Date().toISOString().slice(0, 19)}`,
      source: 'text',
      metadata: input.metadata,
      chunkConfig: input.chunkConfig,
    });
  }

  /**
   * 导入文件
   * 支持两种来源：
   *   - path：agent 本地文件路径（直接解析）
   *   - contentBase64 + fileName：前端上传内容（落临时文件解析后清理）
   * @param {string} collectionId
   * @param {{path?: string, fileName?: string, contentBase64?: string, metadata?: object, chunkConfig?: object}} input
   */
  async ingestFile(collectionId, input = {}) {
    // 来源 1：agent 本地文件
    if (input.path) {
      const { text, fileName } = await loadDocument(input.path);
      return this._ingestText(collectionId, {
        text, name: fileName, source: 'file', metadata: input.metadata, chunkConfig: input.chunkConfig,
      });
    }

    // 来源 2：上传内容（base64）
    if (input.contentBase64) {
      if (!input.fileName) throw new RagError('missingFileName');
      const ext = extname(input.fileName).toLowerCase();
      const tmpFile = join(tmpdir(), `rag-upload-${randomBytes(6).toString('hex')}${ext}`);
      try {
        await writeFile(tmpFile, Buffer.from(input.contentBase64, 'base64'));
        const { text, fileName } = await loadDocument(tmpFile);
        return await this._ingestText(collectionId, {
          text, name: input.fileName || fileName, source: 'file', metadata: input.metadata, chunkConfig: input.chunkConfig,
        });
      } finally {
        // 临时文件清理（Windows 上文件句柄未释放时忽略错误）
        await unlink(tmpFile).catch(() => {});
      }
    }

    throw new RagError('missingFileSource');
  }

  /**
   * 导入 URL 内容（HTML 提取正文 / 文本直取 / PDF 下载解析）
   * @param {string} collectionId
   * @param {{url: string, metadata?: object, chunkConfig?: object}} input
   */
  async ingestUrl(collectionId, input = {}) {
    const url = String(input.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new RagError('invalidUrl');

    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Helper-RAG/1.0)' },
    });
    if (!res.ok) throw new RagError('urlFetchFailed', { status: res.status });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    let text;
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      text = await htmlToText(await res.text());
    } else if (contentType.includes('application/pdf')) {
      const buf = Buffer.from(await res.arrayBuffer());
      const tmpFile = join(tmpdir(), `rag-url-${randomBytes(6).toString('hex')}.pdf`);
      try {
        await writeFile(tmpFile, buf);
        ({ text } = await loadDocument(tmpFile));
      } finally {
        await unlink(tmpFile).catch(() => {});
      }
    } else {
      // text/*、application/json 等按文本处理
      text = await res.text();
    }

    // URL 名称：域名 + 路径尾部（截断）
    const u = new URL(url);
    const tail = u.pathname.split('/').filter(Boolean).pop() || '';
    const name = `${u.hostname}${tail ? '/' + tail : ''}`.slice(0, 100);

    return this._ingestText(collectionId, {
      text, name, source: 'url', metadata: { ...(input.metadata || {}), url }, chunkConfig: input.chunkConfig,
    });
  }

  /**
   * 内部统一导入流程：分块 → 批量向量化 → 事务写入 → 原文备份 → 更新计数
   */
  async _ingestText(collectionId, { text, name, source, metadata, chunkConfig }) {
    const collection = await this.getCollection(collectionId);
    const chunks = chunkText(text, { ...collection.chunkConfig, ...(chunkConfig || {}) });
    if (chunks.length === 0) throw new RagError('emptyDocument');

    const provider = this._getProvider(collection);
    const embeddings = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const vecs = await provider.embedDocuments(batch.map(c => c.text));
      embeddings.push(...vecs);
      console.log(`[RAG] embed ${name}: ${Math.min(i + EMBED_BATCH_SIZE, chunks.length)}/${chunks.length}`);
    }

    const documentId = `doc_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
    const createdAt = new Date().toISOString();

    const store = new VectraStore(collectionId);
    await store.upsertChunks(documentId, chunks, embeddings, {
      documentName: name,
      source,
      createdAt,
      ...(metadata || {}),
    });

    // 原文备份（BM25 docReader 依赖，见设计文档 5.8）
    await this._saveDocumentBackup(collectionId, {
      id: documentId, name, text, source, metadata: metadata || {}, chunkCount: chunks.length, createdAt,
    });

    // 更新注册表计数
    await this._updateRegistry(reg => {
      const target = reg.collections.find(c => c.id === collectionId);
      if (target) {
        target.documentCount = (target.documentCount || 0) + 1;
        target.chunkCount = (target.chunkCount || 0) + chunks.length;
      }
      return reg;
    });

    return { documentId, name, chunkCount: chunks.length };
  }

  async _saveDocumentBackup(collectionId, backup) {
    const dir = join(RAG_ROOT, collectionId, 'documents');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${backup.id}.json`), JSON.stringify(backup), 'utf-8');
  }

  // ==================== 文档管理 ====================

  /**
   * 列出知识库中的所有文档（从分块元数据聚合）
   */
  async listDocuments(collectionId) {
    await this.getCollection(collectionId); // 校验存在性
    const store = new VectraStore(collectionId);
    const items = await store.listAllItems();

    const docs = new Map();
    for (const item of items) {
      const m = item.metadata || {};
      const docId = m.documentId;
      if (!docId) continue;
      if (!docs.has(docId)) {
        docs.set(docId, {
          id: docId,
          name: m.documentName || docId,
          source: m.source || 'unknown',
          createdAt: m.createdAt || null,
          chunkCount: m.totalChunks || 0,
        });
      }
    }
    return [...docs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  /**
   * 删除文档（分块 + 原文备份）
   */
  async deleteDocument(collectionId, documentId) {
    await this.getCollection(collectionId);
    if (!DOCUMENT_ID_RE.test(documentId)) throw new RagError('invalidDocumentId', { id: documentId });

    const store = new VectraStore(collectionId);
    const removed = await store.removeDocument(documentId);

    await unlink(join(RAG_ROOT, collectionId, 'documents', `${documentId}.json`)).catch(() => {});

    await this._updateRegistry(reg => {
      const target = reg.collections.find(c => c.id === collectionId);
      if (target) {
        target.documentCount = Math.max(0, (target.documentCount || 0) - 1);
        target.chunkCount = Math.max(0, (target.chunkCount || 0) - removed);
      }
      return reg;
    });

    return { deleted: true, documentId, removedChunks: removed };
  }

  /**
   * 知识库统计（实时从索引聚合，并回写注册表缓存计数）
   */
  async getStats(collectionId) {
    await this.getCollection(collectionId);
    const store = new VectraStore(collectionId);
    const items = await store.listAllItems();

    const docIds = new Set();
    for (const item of items) {
      const docId = item.metadata?.documentId;
      if (docId) docIds.add(docId);
    }
    const stats = { documentCount: docIds.size, chunkCount: items.length };

    // 回写注册表（修正可能的计数漂移）
    await this._updateRegistry(reg => {
      const target = reg.collections.find(c => c.id === collectionId);
      if (target) {
        target.documentCount = stats.documentCount;
        target.chunkCount = stats.chunkCount;
      }
      return reg;
    }).catch(() => {});

    return stats;
  }

  // ==================== 检索 ====================

  /**
   * 检索
   * @param {string} collectionId
   * @param {string} query
   * @param {{topK?: number, threshold?: number}} [options]
   */
  async search(collectionId, query, options = {}) {
    const collection = await this.getCollection(collectionId);
    if (!query || !String(query).trim()) throw new RagError('emptyQuery');

    const store = new VectraStore(collectionId);
    const provider = this._getProvider(collection);
    const searcher = new Searcher(store, provider);
    return searcher.search(String(query), options);
  }

  /**
   * 跨知识库检索（@知识库多选 / LLM 未指定 collectionId 时）
   * @param {string[]} collectionIds
   * @param {string} query
   * @param {{topK?: number, threshold?: number}} [options]
   */
  async searchMulti(collectionIds, query, options = {}) {
    const all = [];
    const errors = [];
    for (const id of collectionIds) {
      try {
        const result = await this.search(id, query, options);
        for (const r of result.results) {
          all.push({ ...r, collectionId: id });
        }
      } catch (err) {
        errors.push({ collectionId: id, error: err.message });
      }
    }
    // 合并后按 score 排序取 topK
    all.sort((a, b) => b.score - a.score);
    const topK = options.topK || 5;
    return {
      query,
      total: all.length,
      hasContext: all.length > 0,
      results: all.slice(0, topK),
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
