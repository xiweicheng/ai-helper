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
import { mkdir, readFile, writeFile, rm, unlink, readdir, rename, stat, chmod } from 'fs/promises';
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
import { checkPath } from '../security.js';
import { fetchUrlGuarded } from './url-guard.js';
import { loadConfig } from '../config.js';

// 知识库 ID 格式校验（防路径穿越）
const COLLECTION_ID_RE = /^kb_[a-z0-9]+$/;
const DOCUMENT_ID_RE = /^doc_[a-z0-9]+$/;

// 远端（OpenAI 兼容）模式的字段默认值（与 embedding/index.js 的运行时兜底保持一致）
// dimensions: 0 表示未显式指定 → 不向服务端透传 dimensions，使用平台默认维度
const REMOTE_EMBEDDING_DEFAULTS = {
  modelName: 'text-embedding-3-small',
  dimensions: 0,
  queryPrefix: '',
  endpoint: '',
  apiKey: '',
};

/**
 * 解析 embedding 配置为完整快照（注册表落盘用）
 * 规则：
 *   - 跨模式切换：从目标模式默认重置，丢弃旧模式字段（防污染，如远端模型名残留进本地配置）
 *   - 同模式/初次创建：以当前快照（或本地默认）为底，仅覆盖显式提供的字段
 *   - 远端模式：未显式提供的字段优先继承远端当前值，其次远端默认（queryPrefix 默认空）
 * @param {object} input - 前端提交的部分配置
 * @param {object} [current] - 当前生效快照（编辑场景）
 * @returns {object} 完整 embedding 配置
 */
export function resolveEmbeddingConfig(input = {}, current) {
  const patch = { ...(input || {}) };
  const targetMode = patch.mode || current?.mode || DEFAULT_EMBEDDING_CONFIG.mode;
  const crossMode = Boolean(current?.mode) && targetMode !== current.mode;

  const merged = crossMode
    ? {
        ...DEFAULT_EMBEDDING_CONFIG,
        mode: targetMode,
        ...(targetMode === 'openai-compat' ? REMOTE_EMBEDDING_DEFAULTS : {}),
      }
    : { ...DEFAULT_EMBEDDING_CONFIG, ...(current || {}) };
  Object.assign(merged, patch);

  // 远端模式：未显式提供的字段回落到远端当前值或远端默认（防止本地默认值混入）
  if (merged.mode === 'openai-compat') {
    for (const [key, def] of Object.entries(REMOTE_EMBEDDING_DEFAULTS)) {
      if (key in patch) continue;
      const inherited = current?.mode === 'openai-compat' ? current[key] : undefined;
      merged[key] = inherited ?? def;
    }
  }
  return merged;
}

/**
 * 校验 embedding 配置的关键字段（模式/端点/维度）
 * @throws {RagError} invalidEmbeddingMode | invalidEmbeddingEndpoint | invalidEmbeddingDimensions
 */
export function validateEmbeddingConfig(config = {}) {
  const mode = config.mode;
  if (mode !== 'local' && mode !== 'openai-compat') {
    throw new RagError('invalidEmbeddingMode', { mode: String(mode) });
  }
  if (mode !== 'openai-compat') return;
  if (!/^https?:\/\//i.test(String(config.endpoint || '').trim())) {
    throw new RagError('invalidEmbeddingEndpoint');
  }
  const dims = config.dimensions;
  if (dims !== undefined && dims !== null && dims !== '') {
    const n = Number(dims);
    // 0 表示未显式指定（使用平台默认维度）；>0 需为 1-8192 的整数
    if (n !== 0 && (!Number.isInteger(n) || n <= 0 || n > 8192)) {
      throw new RagError('invalidEmbeddingDimensions', { dimensions: String(dims) });
    }
  }
}

/**
 * 判断 embedding 配置变更是否影响向量空间（需重建索引）
 * 仅比较 mode/endpoint/modelName/dimensions；queryPrefix 与 apiKey 不影响向量空间
 */
function needsIndexRebuild(prevCfg = {}, nextCfg = {}) {
  return ['mode', 'endpoint', 'modelName', 'dimensions']
    .some(k => String(prevCfg[k] ?? '') !== String(nextCfg[k] ?? ''));
}

/**
 * 剔除空 apiKey：响应层不回显密钥明文，前端提交空值时视为「未修改」，
 * 交由 resolveEmbeddingConfig 的「未提供字段继承」逻辑沿用已保存值
 */
function dropBlankApiKey(input) {
  if (!input || typeof input !== 'object') return input;
  if (input.apiKey === undefined || String(input.apiKey).trim() !== '') return input;
  const { apiKey, ...rest } = input;
  return rest;
}

export class RagManager {
  constructor(options = {}) {
    // 注册表写互斥锁（Promise 链）
    this._registryLock = Promise.resolve();
    // embedding provider 缓存（key: collectionId；本地 pipeline 单例在 embedding/local.js）
    this._providers = new Map();
    // 导入进度快照（key: collectionId；供前端导入弹窗轮询展示分阶段进度）
    this._ingestProgress = new Map();
    // 进行中的长任务（key: collectionId；导入/重建互斥，防同库并发写索引）
    this._activeOps = new Set();
    // URL 导入内网放行策略覆盖（仅测试注入；缺省 null 时读取 config.ragUrlIngest）
    this._urlIngestPolicyOverride = options.urlIngestPolicy || null;
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
      // 注册表含远端向量服务密钥：创建即 0600，并对历史遗留的宽松权限文件显式收紧
      await writeFile(COLLECTIONS_REGISTRY, JSON.stringify(out, null, 2), { encoding: 'utf-8', mode: 0o600 });
      await chmod(COLLECTIONS_REGISTRY, 0o600).catch(() => {}); // Windows 无 POSIX 权限位，忽略
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

  /**
   * 断言知识库当前无进行中的长任务（导入/重建）
   */
  _assertIdle(collectionId) {
    if (this._activeOps.has(collectionId)) {
      throw new RagError('operationInProgress');
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
    // 解析并校验 embedding 配置（跨模式重置防字段污染；远端模式校验端点与维度）
    const embeddingConfig = resolveEmbeddingConfig(input.embeddingConfig, null);
    validateEmbeddingConfig(embeddingConfig);
    const entry = {
      id,
      name: name.slice(0, 100),
      description: String(input.description || '').slice(0, 500),
      // embedding 配置随库快照（链路一致性：导入与检索使用同一模型）
      embeddingConfig,
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
    this._assertIdle(collectionId); // 导入/重建进行中时禁止删除（防索引写坏）
    // 防路径穿越：ID 已通过正则校验，目录路径安全
    await rm(join(RAG_ROOT, collectionId), { recursive: true, force: true });
    this._providers.delete(collectionId);
    await this._updateRegistry(reg => {
      reg.collections = reg.collections.filter(c => c.id !== collectionId);
      return reg;
    });
    return { deleted: true, id: collectionId };
  }

  /**
   * 更新知识库（名称/描述 / embedding / chunk 配置）
   * embedding 或 chunk 配置发生向量空间级变更时自动重建索引：
   *   - 重建期间新配置不写入注册表（防新旧不一致），完成后一次性生效
   *   - 重建在后台执行（进度经 /ingest/status 轮询），失败时旧索引与旧配置保持可用
   * @param {string} collectionId
   * @param {{name?: string, description?: string, embeddingConfig?: object, chunkConfig?: object}} input
   * @returns {Promise<object>} 更新后的知识库对象（触发重建时附 rebuilding: true）
   */
  async updateCollection(collectionId, input = {}) {
    const collection = await this.getCollection(collectionId); // 校验存在性
    this._assertIdle(collectionId);
    // 同步占位（防并发 PUT/导入/重建）；重建分支的释放职责移交 _startRebuild
    this._activeOps.add(collectionId);
    let handedOff = false;
    try {
      const name = input.name !== undefined ? String(input.name).trim() : collection.name;
      if (!name) throw new RagError('nameRequired');
      const description = input.description !== undefined
        ? String(input.description).slice(0, 500)
        : collection.description;

      // 解析待生效配置（未提交则沿用当前快照）
      // 空 apiKey（响应脱敏后前端不回显）视为未修改，由 resolveEmbeddingConfig 沿用已保存值
      const nextEmbedding = input.embeddingConfig !== undefined
        ? resolveEmbeddingConfig(dropBlankApiKey(input.embeddingConfig), collection.embeddingConfig)
        : collection.embeddingConfig;
      const nextChunk = input.chunkConfig !== undefined
        ? { ...DEFAULT_CHUNK_CONFIG, ...(collection.chunkConfig || {}), ...(input.chunkConfig || {}) }
        : collection.chunkConfig;
      if (input.embeddingConfig !== undefined) validateEmbeddingConfig(nextEmbedding);

      // 向量空间敏感字段（mode/endpoint/modelName/dimensions）或分块参数变更 → 需重建索引
      const embeddingChanged = needsIndexRebuild(collection.embeddingConfig, nextEmbedding);
      const prevChunk = collection.chunkConfig || {};
      const chunkChanged = input.chunkConfig !== undefined
        && (prevChunk.chunkSize !== nextChunk.chunkSize || prevChunk.overlap !== nextChunk.overlap);
      const rebuildNeeded = embeddingChanged || chunkChanged;

      // 名称/描述落盘；无需重建的配置变化（如 apiKey/queryPrefix）也在此直接生效
      const updated = await this._updateRegistry(reg => {
        const target = reg.collections.find(c => c.id === collectionId);
        if (!target) throw new RagError('collectionNotFound', { id: collectionId });
        target.name = name.slice(0, 100);
        target.description = description;
        if (!rebuildNeeded && input.embeddingConfig !== undefined) {
          target.embeddingConfig = nextEmbedding;
        }
        return reg;
      });

      if (!rebuildNeeded) {
        if (input.embeddingConfig !== undefined) this._providers.delete(collectionId); // 配置已变，缓存失效
        return updated.collections.find(c => c.id === collectionId);
      }

      // 预置重建进度快照（防前端轮询读到上一次导入的陈旧 done），随后后台执行
      this._reportProgress(collectionId, {
        phase: 'rebuilding', current: 0, total: collection.documentCount || 0, done: false, error: null,
      });
      this._startRebuild(collectionId, nextEmbedding, nextChunk);
      handedOff = true; // 释放职责移交 _startRebuild（完成时删除 _activeOps 占位）
      const out = updated.collections.find(c => c.id === collectionId);
      return { ...out, rebuilding: true };
    } finally {
      if (!handedOff) this._activeOps.delete(collectionId);
    }
  }

  /**
   * 后台执行索引重建（fire-and-forget；进度经 _reportProgress → /ingest/status 轮询）
   * 失败仅上报 error 阶段，旧索引与旧配置保持可用（清理策略见 _rebuildIndex）
   */
  _startRebuild(collectionId, embeddingConfig, chunkConfig) {
    this._rebuildIndex(collectionId, embeddingConfig, chunkConfig)
      .then(({ chunkCount }) => {
        this._reportProgress(collectionId, {
          phase: 'done', current: chunkCount, total: chunkCount, done: true, error: null,
        });
      })
      .catch(err => {
        console.error('[RAG] rebuild failed:', err);
        this._reportProgress(collectionId, { phase: 'error', done: true, error: err.message });
      })
      .finally(() => {
        this._activeOps.delete(collectionId);
      });
  }

  /**
   * 重建索引：临时目录用新配置全量重放文档备份 → 原子换入 → 最后写注册表新配置
   * 不变式：换入成功前不动旧索引、不改注册表；任一步失败都可退回旧索引
   * @returns {Promise<{chunkCount: number, documentCount: number}>}
   */
  async _rebuildIndex(collectionId, embeddingConfig, chunkConfig) {
    const finalDir = join(RAG_ROOT, collectionId);
    const docsDir = join(finalDir, 'documents');
    const tmpRoot = join(RAG_ROOT, `.rebuild_${collectionId}`);

    // 1. 读取全部文档备份（所有导入来源均有全文备份，见 _saveDocumentBackup）
    let backups = [];
    try {
      const files = await readdir(docsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          backups.push(JSON.parse(await readFile(join(docsDir, file), 'utf-8')));
        } catch {
          console.warn(`[RAG] rebuild: skip corrupted backup ${file}`);
        }
      }
    } catch {
      // documents 目录不存在（空库）：按空库重建
    }
    backups.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

    try {
      // 2. 临时目录构建新索引（不影响线上索引）
      await rm(tmpRoot, { recursive: true, force: true });
      const provider = createEmbeddingProvider(embeddingConfig);
      const store = new VectraStore(collectionId, tmpRoot);
      await store.ensureCreated();

      const chunkConfigForBuild = { ...DEFAULT_CHUNK_CONFIG, ...(chunkConfig || {}) };
      const total = backups.length;
      const newBackups = [];
      let chunkCount = 0;
      this._reportProgress(collectionId, { phase: 'rebuilding', current: 0, total, done: false, error: null });
      for (let i = 0; i < backups.length; i++) {
        const doc = backups[i];
        const text = String(doc.text || '');
        const chunks = text.trim() ? chunkText(text, chunkConfigForBuild) : [];
        if (chunks.length > 0) {
          const embeddings = await this._embedChunks(provider, chunks, embeddingConfig);
          await store.upsertChunks(doc.id, chunks, embeddings, {
            documentName: doc.name,
            source: doc.source,
            createdAt: doc.createdAt,
            ...(doc.metadata || {}),
          });
          chunkCount += chunks.length;
        }
        newBackups.push({ ...doc, chunkCount: chunks.length });
        this._reportProgress(collectionId, { phase: 'rebuilding', current: i + 1, total, done: false, error: null });
      }

      // 新备份写入新索引目录（chunkCount 按新分块参数更新）
      const newDocsDir = join(tmpRoot, collectionId, 'documents');
      await mkdir(newDocsDir, { recursive: true });
      for (const backup of newBackups) {
        await writeFile(join(newDocsDir, `${backup.id}.json`), JSON.stringify(backup), 'utf-8');
      }

      // 3. 原子换入（同设备 rename）：旧索引先整体移出保命 → 新索引就位 → 失败回滚旧索引
      const oldIndexKeep = join(tmpRoot, 'index_backup');
      await rename(finalDir, oldIndexKeep);
      try {
        await rename(join(tmpRoot, collectionId), finalDir);
      } catch (err) {
        await rename(oldIndexKeep, finalDir).catch(() => {}); // 回滚（尽力而为）
        throw err;
      }
      await rm(oldIndexKeep, { recursive: true, force: true }).catch(() => {});
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});

      // 4. 换入成功后写入注册表新配置与计数
      const documentCount = newBackups.filter(b => (b.chunkCount || 0) > 0).length;
      await this._updateRegistry(reg => {
        const target = reg.collections.find(c => c.id === collectionId);
        if (target) {
          target.embeddingConfig = embeddingConfig;
          target.chunkConfig = chunkConfigForBuild;
          target.documentCount = documentCount;
          target.chunkCount = chunkCount;
        }
        return reg;
      });
      this._providers.delete(collectionId); // 配置已换，缓存失效

      console.log(`[RAG] rebuild done: ${collectionId}, ${documentCount} docs / ${chunkCount} chunks`);
      return { chunkCount, documentCount };
    } catch (err) {
      // 失败清理：旧索引仍在（finalDir 存在）时临时目录可安全删除；
      // 否则保留临时目录（含 index_backup）供登记恢复，不自动清理
      const finalDirExists = await stat(finalDir).then(() => true).catch(() => false);
      if (finalDirExists) {
        await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
      } else {
        console.error(`[RAG] rebuild: keep ${tmpRoot} for recovery (final dir missing)`);
      }
      throw err;
    }
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
   * 获取指定知识库最近的导入进度快照（供前端轮询；无任务时返回 null）
   */
  getIngestProgress(collectionId) {
    return this._ingestProgress.get(collectionId) || null;
  }

  /**
   * 更新导入进度快照（浅合并；导入结束后保留，供最后一次轮询读取）
   */
  _reportProgress(collectionId, update) {
    const prev = this._ingestProgress.get(collectionId) || {};
    this._ingestProgress.set(collectionId, { ...prev, ...update, updatedAt: new Date().toISOString() });
  }

  /**
   * 导入执行包装：统一捕获解析/向量化/存储任一步骤的错误并上报 error 阶段
   * （成功路径的阶段上报由 _ingestText 内部完成）
   */
  async _runIngest(collectionId, fn) {
    // 同库导入/重建互斥（同步占位，无竞态窗口）；并发请求直接失败，避免索引写坏
    this._assertIdle(collectionId);
    this._activeOps.add(collectionId);
    try {
      return await fn();
    } catch (err) {
      this._reportProgress(collectionId, { phase: 'error', done: true, error: err.message });
      throw err;
    } finally {
      this._activeOps.delete(collectionId);
    }
  }

  /**
   * 导入文本内容
   * @param {string} collectionId
   * @param {{content: string, name?: string, metadata?: object, chunkConfig?: object}} input
   * @returns {Promise<{documentId: string, name: string, chunkCount: number}>}
   */
  async ingestText(collectionId, input = {}) {
    return this._runIngest(collectionId, async () => {
      const content = String(input.content || '');
      if (!content.trim()) throw new RagError('emptyContent');
      return this._ingestText(collectionId, {
        text: content,
        name: input.name || `text_${new Date().toISOString().slice(0, 19)}`,
        source: 'text',
        metadata: input.metadata,
        chunkConfig: input.chunkConfig,
      });
    });
  }

  /**
   * 导入文件
   * 支持两种来源：
   *   - path：agent 本地文件路径（沙箱校验后解析，受 allowedPaths 白名单与硬阻止清单约束）
   *   - contentBase64 + fileName：前端上传内容（落临时文件解析后清理）
   * @param {string} collectionId
   * @param {{path?: string, fileName?: string, contentBase64?: string, metadata?: object, chunkConfig?: object}} input
   */
  async ingestFile(collectionId, input = {}) {
    return this._runIngest(collectionId, async () => {
      // 来源 1：agent 本地文件
      if (input.path) {
        // 文件沙箱：与 /api/fs/read 同一套规则（allowedPaths 白名单 + 硬阻止清单），
        // 防止经 RAG 导入绕过沙箱读取宿主任意文件（如代理自身敏感文件）
        const check = await checkPath(input.path);
        if (!check.allowed) {
          throw new RagError('pathNotAllowed', { reason: check.reason });
        }
        this._reportProgress(collectionId, { phase: 'parsing', current: 0, total: 0, done: false, error: null });
        const { text, fileName } = await loadDocument(check.resolved || input.path);
        return this._ingestText(collectionId, {
          text, name: fileName, source: 'file', metadata: input.metadata, chunkConfig: input.chunkConfig,
        });
      }

      // 来源 2：上传内容（base64）
      if (input.contentBase64) {
        if (!input.fileName) throw new RagError('missingFileName');
        const ext = extname(input.fileName).toLowerCase();
        const tmpFile = join(tmpdir(), `rag-upload-${randomBytes(6).toString('hex')}${ext}`);
        this._reportProgress(collectionId, { phase: 'parsing', current: 0, total: 0, done: false, error: null });
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
    });
  }

  /**
   * URL 导入内网放行策略（config.ragUrlIngest；构造参数可注入覆盖，供测试）
   */
  _urlIngestPolicy() {
    if (this._urlIngestPolicyOverride) return this._urlIngestPolicyOverride;
    return loadConfig().ragUrlIngest;
  }

  /**
   * 导入 URL 内容（HTML 提取正文 / 文本直取 / PDF 下载解析）
   * 安全：逐跳重定向校验 + 私网拦截（白名单优先/总开关，见 url-guard.js）+ 响应体大小上限
   * @param {string} collectionId
   * @param {{url: string, metadata?: object, chunkConfig?: object}} input
   */
  async ingestUrl(collectionId, input = {}) {
    return this._runIngest(collectionId, async () => {
      const url = String(input.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw new RagError('invalidUrl');

      this._reportProgress(collectionId, { phase: 'parsing', current: 0, total: 0, done: false, error: null });
      const { bytes, contentType } = await fetchUrlGuarded(url, this._urlIngestPolicy());

      let text;
      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        text = await htmlToText(bytes.toString('utf-8'));
      } else if (contentType.includes('application/pdf')) {
        const tmpFile = join(tmpdir(), `rag-url-${randomBytes(6).toString('hex')}.pdf`);
        try {
          await writeFile(tmpFile, bytes);
          ({ text } = await loadDocument(tmpFile));
        } finally {
          await unlink(tmpFile).catch(() => {});
        }
      } else {
        // text/*、application/json 等按文本处理
        text = bytes.toString('utf-8');
      }

      // URL 名称：域名 + 路径尾部（截断）
      const u = new URL(url);
      const tail = u.pathname.split('/').filter(Boolean).pop() || '';
      const name = `${u.hostname}${tail ? '/' + tail : ''}`.slice(0, 100);

      return this._ingestText(collectionId, {
        text, name, source: 'url', metadata: { ...(input.metadata || {}), url }, chunkConfig: input.chunkConfig,
      });
    });
  }

  /**
   * 内部统一导入流程：分块 → 批量向量化 → 事务写入 → 原文备份 → 更新计数
   * 全程上报进度快照（parsing/chunking/embedding/storing/done/error），供前端轮询展示
   */
  async _ingestText(collectionId, { text, name, source, metadata, chunkConfig }) {
    try {
      const collection = await this.getCollection(collectionId);
      this._reportProgress(collectionId, { phase: 'chunking', current: 0, total: 0, done: false, error: null });
      const chunks = chunkText(text, { ...collection.chunkConfig, ...(chunkConfig || {}) });
      if (chunks.length === 0) throw new RagError('emptyDocument');

      const provider = this._getProvider(collection);
      this._reportProgress(collectionId, { phase: 'embedding', current: 0, total: chunks.length });
      const embeddings = await this._embedChunks(provider, chunks, collection.embeddingConfig, (embedded) => {
        this._reportProgress(collectionId, { phase: 'embedding', current: embedded, total: chunks.length });
        console.log(`[RAG] embed ${name}: ${embedded}/${chunks.length}`);
      });

      const documentId = `doc_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
      const createdAt = new Date().toISOString();

      this._reportProgress(collectionId, { phase: 'storing', current: chunks.length, total: chunks.length });
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

      this._reportProgress(collectionId, { phase: 'done', current: chunks.length, total: chunks.length, done: true });
      return { documentId, name, chunkCount: chunks.length };
    } catch (err) {
      this._reportProgress(collectionId, { phase: 'error', done: true, error: err.message });
      throw err;
    }
  }

  /**
   * 批量向量化（含维度校验）：模型实际输出维度与配置不符时立即报错，
   * 避免不一致的向量写入索引（常见于远端模型与 dimensions 配置不匹配）
   * @param {import('./embedding/index.js').EmbeddingProvider} provider
   * @param {Array<{text: string}>} chunks
   * @param {object} embeddingConfig
   * @param {(embedded: number, total: number) => void} [onBatch] 每批完成回调（进度上报）
   * @returns {Promise<number[][]>}
   */
  async _embedChunks(provider, chunks, embeddingConfig, onBatch) {
    const expected = Number(embeddingConfig?.dimensions) || 0;
    const embeddings = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const vecs = await provider.embedDocuments(batch.map(c => c.text));
      if (expected > 0) {
        for (const vec of vecs) {
          const actual = Array.isArray(vec) ? vec.length : 0;
          if (actual !== expected) {
            throw new RagError('embeddingDimensionMismatch', { expected, actual });
          }
        }
      }
      embeddings.push(...vecs);
      if (onBatch) onBatch(Math.min(i + EMBED_BATCH_SIZE, chunks.length), chunks.length);
    }
    return embeddings;
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
    this._assertIdle(collectionId);
    // 删除同样是索引写操作：占位防与导入/重建并发交错写坏索引
    this._activeOps.add(collectionId);
    try {
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
    } finally {
      this._activeOps.delete(collectionId);
    }
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
   * topK 作为总量预算按引用库数均分（至少 1 条/库）：保证每个被引用的库都有配额进入结果，
   * 避免全局截断被高得分库垄断导致其他库 0 命中（前端表现为"只引用了一个库"）
   * @param {string[]} collectionIds
   * @param {string} query
   * @param {{topK?: number, threshold?: number}} [options]
   */
  async searchMulti(collectionIds, query, options = {}) {
    const all = [];
    const errors = [];
    const globalTopK = options.topK || 5;
    const n = Math.max(collectionIds.length, 1);
    const perQuota = Math.max(1, Math.ceil(globalTopK / n));
    for (const id of collectionIds) {
      try {
        const result = await this.search(id, query, { ...options, topK: perQuota });
        for (const r of result.results) {
          all.push({ ...r, collectionId: id });
        }
      } catch (err) {
        errors.push({ collectionId: id, error: err.message });
      }
    }
    // 合并后按 score 排序；每库配额已在检索阶段生效，不再做全局 topK 截断
    all.sort((a, b) => b.score - a.score);
    return {
      query,
      total: all.length,
      hasContext: all.length > 0,
      results: all,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
