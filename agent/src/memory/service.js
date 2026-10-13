// agent/src/memory/service.js - 长期记忆业务逻辑（自扩展端 tool-memory.js 下推，行为不变）
// 召回有两条通道：关键词通道（缺省即全部，行为与下推时逐字一致）+ 可选向量通道（memoryEmbedding.enabled）。
// 逻辑与数据文件同进程：fs 直接读写 MEMORY_DIR/global-memory.json，互斥锁进程内生效。
// store/recall/manage 按 action 分发；文案经调用方传入的请求语言 t 闭包渲染。

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { MEMORY_DIR } from '../config.js';
import { calcMemoryValue, selectMemoriesForInjection } from './injection.js';
import { extractKeywords } from './tokens.js';
import { getMemoryEmbeddingConfig, toEmbeddingProviderConfig } from './embedding-config.js';
import { createVectorStoreFacade, memoryModelKey, cosine } from './vectors.js';
import { resolveMemoryTier, isVectorTier, MEMORY_VECTOR_THRESHOLD } from './tier.js';
import { isRagAvailable } from '../rag/detect.js';
import { EMBED_BATCH_SIZE } from '../rag/config.js';
import { createEmbeddingProvider } from '../rag/embedding/index.js';

// 记忆数据结构默认值（迁移自 tool-memory.js:137-144，字段与版本结构保持一致）
const DEFAULT_MEMORY_DATA = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  stats: { totalFacts: 0, totalSummaries: 0, lastReviewAt: null },
  facts: [],
  summaries: [],
  meta: { maxFacts: 50, maxSummaries: 20, reviewThreshold: 0.8 }
});

/**
 * 生成记忆ID（迁移自 tool-memory.js:190-195）
 */
function generateMemoryId(type) {
  const prefix = type === 'fact' ? 'fact' : 'sum';
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${timestamp}_${random}`;
}

// 查询向量的一次嵌入上限（与 embedding 探活端点同口径）：超时即降级到关键词单通道
const MEMORY_EMBED_TIMEOUT_MS = 8000;

// 向量命中折算到记忆侧整数分值上的加分。记忆关键词分是「content+3 / title+2 / tags+2 / 全文精确 +5+3」
// 的整数累加，RAG searcher 用的是 [0,1] 余弦 + 0.1 加分，两把尺子不可比：把 searcher 的常量搬过来
// 等于改写关键词档的计分，违反「未启用向量时行为逐字不变」的硬约束。因此向量分落在同一把整数尺子上：
// 达阈值先保底一次 content 命中的权重，相似度满值再折 4 分（合计 7 ≈ content+title+tags 同时命中）。
const VECTOR_HIT_BONUS = 3;
const VECTOR_SCALE_POINTS = 4;

/**
 * 关键词通道计分（自 recall 内联代码原样抽出，权重与判定顺序逐字不变）
 * @returns {number} 整数分，0 表示词面完全不沾
 */
function keywordScore(m, keywords, originalQuery) {
  let score = 0;
  const content = (m.content || '').toLowerCase();
  const title = (m.title || '').toLowerCase();
  const memTags = (m.tags || []).map(tg => tg.toLowerCase());
  for (const kw of keywords) {
    if (content.includes(kw)) score += 3;
    if (title.includes(kw)) score += 2;
    if (memTags.some(tg => tg.includes(kw))) score += 2;
  }
  if (originalQuery.length >= 2) {
    if (content.includes(originalQuery)) score += 5;
    if (title.includes(originalQuery)) score += 3;
  }
  return score;
}

/** 参与 embedding 的文本：与关键词通道同一字段面（content + title + tags） */
function memorySearchText(m) {
  return [m.content, m.title, (m.tags || []).join(' ')]
    .filter(Boolean)
    .join('\n');
}

/**
 * 创建记忆服务实例
 * @param {object} [options] 注入点：filePath / vectorsFilePath 指定数据与向量缓存路径（测试用），
 *   embeddingConfigProvider / tierResolver / embedderFactory / embedTimeoutMs 用于关闭网络与真实配置依赖。
 *   缺省全部走真实实现：向量通道只在 memoryEmbedding 显式启用后开启，未启用时 recall 与历史行为一致。
 * @returns {{store: Function, recall: Function, manage: Function, injectSelect: Function, backfillVectors: Function, readAll: Function}}
 */
export function createMemoryService({
  filePath = join(MEMORY_DIR, 'global-memory.json'),
  vectorsFilePath,
  embeddingConfigProvider = getMemoryEmbeddingConfig,
  embedderFactory = (cfg) => createEmbeddingProvider(cfg),
  tierResolver = (cfg) => resolveMemoryTier(cfg, isRagAvailable()),
  embedTimeoutMs = MEMORY_EMBED_TIMEOUT_MS
} = {}) {
  const vectors = createVectorStoreFacade(vectorsFilePath ? { filePath: vectorsFilePath } : {});
  let cachedProvider = null;
  let cachedProviderKey = null;

  /** provider 按模型标识复用：改配置即重建，避免拿旧 endpoint/key 打新模型 */
  function getProvider() {
    const cfg = embeddingConfigProvider();
    const key = memoryModelKey(cfg);
    if (!cachedProvider || cachedProviderKey !== key) {
      cachedProvider = embedderFactory(toEmbeddingProviderConfig(cfg));
      cachedProviderKey = key;
    }
    return { provider: cachedProvider, cfg };
  }

  /** 嵌入调用带超时上限：外部 embedding 端点挂起不能把一次召回无限拖住（超时即退回关键词通道） */
  async function embedWithTimeout(promise) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('embedding_timeout')), embedTimeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 新增/改写记忆后异步补一个向量（懒补）。
   * 绝不 await：嵌入是外部网络调用，等它就等于给每次 store 多加一个往返。
   * 失败只 warn——派生缓存缺项不影响正确性，recall 命中该条目时还会再补一次。
   */
  function queueVectorBackfill(id, memory) {
    let cfg;
    try {
      cfg = embeddingConfigProvider();
      if (!isVectorTier(tierResolver(cfg))) return;
    } catch (err) {
      console.warn('[Memory] tier resolve failed, skip lazy vector backfill:', err.message);
      return;
    }
    queueMicrotask(async () => {
      try {
        const vecs = await embedWithTimeout(getProvider().provider.embedDocuments([memorySearchText(memory)]));
        const vec = Array.isArray(vecs) ? vecs[0] : null;
        if (Array.isArray(vec) && vec.length) await vectors.upsertVectors([[id, vec]], memoryModelKey(cfg));
      } catch (err) {
        console.warn('[Memory] lazy vector backfill failed:', err.message);
      }
    });
  }

  // 进程内互斥锁：保护 read-modify-write（替代扩展端 SW 内存锁，tool-memory.js:111-130 语义）
  let lockChain = Promise.resolve();
  function withMemoryLock(task) {
    let release;
    const gate = new Promise((r) => { release = r; });
    const run = lockChain.then(task).finally(release);
    lockChain = lockChain.then(() => gate);
    return run;
  }

  // 读取记忆文件（迁移自 readMemoryFile tool-memory.js:150-173；文件不存在返回默认结构）
  async function readMemoryFile() {
    let content;
    try {
      content = await readFile(filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { success: true, data: DEFAULT_MEMORY_DATA() };
      }
      return { success: false, error: err.message };
    }
    try {
      const data = JSON.parse(content);
      const defaults = DEFAULT_MEMORY_DATA();
      return {
        success: true,
        data: {
          ...defaults,
          ...data,
          stats: { ...defaults.stats, ...(data.stats || {}) },
          meta: { ...defaults.meta, ...(data.meta || {}) }
        }
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // 写入记忆文件（迁移自 writeMemoryFile tool-memory.js:179-185：stats/version/updatedAt 维护逻辑不变）
  async function writeMemoryFile(data) {
    data.updatedAt = new Date().toISOString();
    data.stats.totalFacts = (data.facts || []).length;
    data.stats.totalSummaries = (data.summaries || []).length;
    data.version = data.version || 1;
    try {
      await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * store：新增/更新/删除记忆（迁移自 executeAgentMemoryStore tool-memory.js:215-347）
   * args.action 为子动作 add/update/delete（扩展转发层已将 subAction 映射到 action）
   */
  async function store(args, t) {
    const { action, type, category, content, title, tags, importance, memoryId, sourceSessionId } = args;

    if (!action) return { success: false, error: t('memory.missingAction') };
    // delete 不需要 type（memoryId 全局唯一），add/update 需要
    if (!type && action !== 'delete') return { success: false, error: t('memory.missingType') };
    if (!content && action !== 'delete') return { success: false, error: t('memory.missingContent') };

    return withMemoryLock(async () => {
      const readResult = await readMemoryFile();
      if (!readResult.success) return { success: false, error: t('memory.readFailed', { error: readResult.error }) };

      const memoryData = readResult.data;
      const now = new Date().toISOString();
      const targetArray = type === 'fact' ? memoryData.facts : memoryData.summaries;

      if (action === 'add') {
        const newMemory = {
          id: generateMemoryId(type),
          type,
          category: category || 'custom',
          content,
          tags: tags || [],
          importance: importance || 5,
          accessCount: 0,
          lastAccessAt: null,
          createdAt: now,
          updatedAt: now,
          sourceSessionId: sourceSessionId || null
        };
        if (type === 'summary' && title) {
          newMemory.title = title;
        }

        // 简单去重：检查是否有内容完全相同的记忆
        const duplicate = targetArray.find(m => m.content === content && m.type === type);
        if (duplicate) {
          duplicate.updatedAt = now;
          duplicate.tags = tags || duplicate.tags;
          duplicate.importance = importance || duplicate.importance;
          duplicate.sourceSessionId = sourceSessionId || duplicate.sourceSessionId;
          const writeResult = await writeMemoryFile(memoryData);
          if (!writeResult.success) return { success: false, error: t('memory.writeFailed', { error: writeResult.error }) };
          queueVectorBackfill(duplicate.id, duplicate);
          return {
            success: true,
            message: t('memory.updatedDuplicate', { id: duplicate.id }),
            memory: duplicate,
            action: 'updated',
            stats: memoryData.stats
          };
        }

        targetArray.push(newMemory);
        const writeResult = await writeMemoryFile(memoryData);
        if (!writeResult.success) return { success: false, error: t('memory.writeFailed', { error: writeResult.error }) };

        // 检查是否接近上限
        const maxFacts = memoryData.meta.maxFacts;
        const maxSummaries = memoryData.meta.maxSummaries;
        const factRatio = memoryData.facts.length / maxFacts;
        const summaryRatio = memoryData.summaries.length / maxSummaries;
        let warning = '';
        if (factRatio >= 0.8 || summaryRatio >= 0.8) {
          warning = t('memory.nearLimitWarning', { facts: memoryData.facts.length, maxFacts, summaries: memoryData.summaries.length, maxSummaries });
        }

        queueVectorBackfill(newMemory.id, newMemory);
        return {
          success: true,
          message: t('memory.added', { id: newMemory.id, type, warning }),
          memory: newMemory,
          action: 'added',
          stats: memoryData.stats
        };
      }

      if (action === 'update') {
        if (!memoryId) return { success: false, error: t('memory.updateNeedsId') };

        const idx = targetArray.findIndex(m => m.id === memoryId);
        if (idx === -1) {
          // 尝试在另一个数组中查找
          const otherArray = type === 'fact' ? memoryData.summaries : memoryData.facts;
          const otherIdx = otherArray.findIndex(m => m.id === memoryId);
          if (otherIdx !== -1) {
            return { success: false, error: t('memory.typeMismatch', { id: memoryId, type: otherArray[otherIdx].type }) };
          }
          return { success: false, error: t('memory.notFound', { id: memoryId }) };
        }

        const existing = targetArray[idx];
        if (content !== undefined) existing.content = content;
        if (tags !== undefined) existing.tags = tags;
        if (importance !== undefined) existing.importance = importance;
        if (category !== undefined) existing.category = category;
        if (type === 'summary' && title !== undefined) existing.title = title;
        existing.updatedAt = now;

        const writeResult = await writeMemoryFile(memoryData);
        if (!writeResult.success) return { success: false, error: t('memory.writeFailed', { error: writeResult.error }) };

        queueVectorBackfill(memoryId, existing);
        return {
          success: true,
          message: t('memory.updated', { id: memoryId }),
          memory: existing,
          action: 'updated',
          stats: memoryData.stats
        };
      }

      if (action === 'delete') {
        if (!memoryId) return { success: false, error: t('memory.deleteNeedsId') };

        // 在 facts 和 summaries 两个数组中查找（不依赖 type 参数）
        const arrays = [memoryData.facts, memoryData.summaries];
        for (const arr of arrays) {
          const idx = arr.findIndex(m => m.id === memoryId);
          if (idx !== -1) {
            const removed = arr.splice(idx, 1)[0];
            removeFromRecalledCache(memoryId);
            const writeResult = await writeMemoryFile(memoryData);
            if (!writeResult.success) return { success: false, error: t('memory.writeFailed', { error: writeResult.error }) };
            // 记忆真源已删，向量缓存必须同步摘除（否则孤儿向量会在下次召回里指向不存在的条目）
            await vectors.dropVectors([memoryId]);
            return {
              success: true,
              message: t('memory.deleted', { id: memoryId }),
              removed,
              stats: memoryData.stats
            };
          }
        }

        return { success: false, error: t('memory.notFound', { id: memoryId }) };
      }

      return { success: false, error: t('memory.unsupportedAction', { action }) };
    });
  }

  // ==================== 会话召回缓存（迁移自 tool-memory.js:350-364） ====================
  // 每 session 已召回的记忆 ID 集合，防止同一对话重复返回相同记忆
  const sessionRecalledMemoryIds = new Map();

  function removeFromRecalledCache(memoryId) {
    for (const [sessionId, recalledSet] of sessionRecalledMemoryIds.entries()) {
      if (recalledSet.has(memoryId)) {
        recalledSet.delete(memoryId);
        if (recalledSet.size === 0) {
          sessionRecalledMemoryIds.delete(sessionId);
        }
      }
    }
  }


  /**
   * recall：从长期记忆中检索相关信息（迁移自 executeAgentMemoryRecall tool-memory.js:369-608）
   * @param {object} args { query, tags, memoryType='all', limit=10 }
   * @param {string|null} sessionId 会话 ID，用于 session 级召回去重
   * @param {Function} t 请求语言翻译函数
   */
  async function recall(args, sessionId, t) {
    const { query, tags, memoryType = 'all', limit = 10 } = args;

    // 档位判定与查询向量在取锁之前完成：embedding 是外部网络调用，放进互斥锁里会让一次慢请求
    // 阻塞同进程的所有记忆写入（锁是进程内 Promise 链，没有超时逃生口）。
    const tier = tierResolver(embeddingConfigProvider());
    let queryVec = null;
    if (isVectorTier(tier) && query && query.trim()) {
      try {
        const { provider } = getProvider();
        const vec = await embedWithTimeout(provider.embedQuery(query));
        queryVec = Array.isArray(vec) && vec.length ? vec : null;
      } catch (err) {
        console.warn('[Memory] embedQuery failed, fallback to keyword-only:', err.message);
        queryVec = null;
      }
    }
    // fused = 本次确实拿到了可用的查询向量（queryVec 仅在向量档且嵌入成功时非空）
    const fused = queryVec !== null;

    return withMemoryLock(async () => {
      const readResult = await readMemoryFile();
      if (!readResult.success) return { success: false, error: t('memory.readFailed', { error: readResult.error }) };

      const memoryData = readResult.data;

      // 收集所有记忆
      let candidates = [];
      if (memoryType === 'all' || memoryType === 'fact') {
        candidates.push(...memoryData.facts.map(m => ({ ...m, _source: 'facts' })));
      }
      if (memoryType === 'all' || memoryType === 'summary') {
        candidates.push(...memoryData.summaries.map(m => ({ ...m, _source: 'summaries' })));
      }

      if (candidates.length === 0) {
        return {
          success: true,
          message: t('memory.memoryEmpty'),
          results: [],
          total: 0,
          query,
          tier,
          vectorMatched: 0
        };
      }

      // 按标签筛选
      if (tags && tags.length > 0) {
        candidates = candidates.filter(m => {
          const memTags = (m.tags || []).map(tg => tg.toLowerCase());
          return tags.some(tg => memTags.includes(tg.toLowerCase()));
        });
      }

      // 按关键词搜索
      let vectorMatched = 0;
      if (query && query.trim()) {
        const keywords = extractKeywords(query);
        const originalQuery = query.toLowerCase().trim();

        if (keywords.length > 0 && !fused) {
          // 关键词单通道：A 档（未启用向量）走这条，向量档但本次查询向量不可用时也退回这条，
          // 因此融合失败的最坏情况就是今天的行为，不会更差。
          const scored = candidates.map(m => ({ memory: m, score: keywordScore(m, keywords, originalQuery) }));

          // 有匹配关键词的才返回，按分数排序
          candidates = scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(s => s.memory);

          // 迁移说明：原扩展端（tool-memory.js:499-513）的"全文 fallback"分支过滤的是已被
          // 上一行赋值清空的 candidates 数组，恒返回空，属死代码，未随迁——行为等价。
        } else if (fused) {
          // 双通道融合：词面分照算，语义达阈值的条目在其词面分之上叠加整数向量分。
          // 关键词零命中但语义达阈值的条目由此能被召回——这是 A 档拿不到的增量。
          const vecMap = (await vectors.read()).vectors;

          const missing = candidates.filter(m => m.id && !(m.id in vecMap));
          if (missing.length) {
            // 派生缓存按需补齐：真源是 global-memory.json，补不上只是这次少一条语义分，不影响正确性
            try {
              const { provider, cfg } = getProvider();
              const vecs = await embedWithTimeout(provider.embedDocuments(missing.map(memorySearchText)));
              const pairs = missing.map((m, i) => [m.id, Array.isArray(vecs) ? vecs[i] : undefined]).filter(([, v]) => Array.isArray(v) && v.length);
              if (pairs.length) {
                await vectors.upsertVectors(pairs, memoryModelKey(cfg));
                for (const [id, v] of pairs) vecMap[id] = v;
              }
            } catch (err) {
              console.warn('[Memory] vector backfill skipped:', err.message);
            }
          }

          const scored = candidates.map(m => {
            const score = keywordScore(m, keywords, originalQuery);
            const vec = m.id ? vecMap[m.id] : null;
            const cos = vec ? cosine(queryVec, vec) : 0;
            if (cos >= MEMORY_VECTOR_THRESHOLD) {
              vectorMatched++;
              return { memory: m, score: score + VECTOR_HIT_BONUS + Math.round(cos * VECTOR_SCALE_POINTS) };
            }
            return { memory: m, score };
          });

          candidates = scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(s => s.memory);
        }
      }

      // 去重（同一记忆 id 全局唯一，但仍处理一下）
      const seen = new Set();
      let results = candidates.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      }).slice(0, limit);

      // Session 级去重：优先返回本对话未召回过的记忆
      let recallNote = '';
      if (sessionId) {
        const recalledSet = sessionRecalledMemoryIds.get(sessionId);
        if (recalledSet && recalledSet.size > 0) {
          const newResults = [];
          const oldResults = [];
          for (const m of results) {
            if (recalledSet.has(m.id)) {
              oldResults.push(m);
            } else {
              newResults.push(m);
            }
          }

          // 优先返回新记忆；如果没有新记忆，但有旧记忆，则返回旧记忆并提示
          if (newResults.length === 0 && oldResults.length > 0) {
            recallNote = t('memory.recallNoteAllOld');
            results = oldResults;
          } else if (newResults.length > 0) {
            if (oldResults.length > 0) {
              recallNote = t('memory.recallNoteMixed', { oldCount: oldResults.length, newCount: newResults.length });
            }
            results = newResults;
          }
        }
      }

      // 记录本次召回的记忆 ID
      if (sessionId && results.length > 0) {
        if (!sessionRecalledMemoryIds.has(sessionId)) {
          sessionRecalledMemoryIds.set(sessionId, new Set());
        }
        const recalledSet = sessionRecalledMemoryIds.get(sessionId);
        for (const m of results) {
          recalledSet.add(m.id);
        }
      }

      // 更新访问计数
      for (const m of results) {
        const source = m._source === 'facts' ? memoryData.facts : memoryData.summaries;
        const found = source.find(sm => sm.id === m.id);
        if (found) {
          found.accessCount = (found.accessCount || 0) + 1;
          found.lastAccessAt = new Date().toISOString();
        }
      }

      // 写回更新后的访问计数（非关键操作，失败不阻塞返回）
      try {
        await writeMemoryFile(memoryData);
      } catch (e) {
        console.warn('[Memory] update visitcount failed:', e.message);
      }

      // 格式化输出
      const resultText = results.length === 0
        ? t('memory.noMatch')
        : t('memory.foundResults', { count: results.length, note: recallNote }) + '\n\n' + results.map((m, i) => {
            let text = t('memory.memoryItemHeader', { index: i + 1, type: m.type === 'fact' ? t('memory.factLabel') : t('memory.summaryLabel'), id: m.id }) + '\n';
            text += t('memory.memoryItemContent', { content: m.content }) + '\n';
            if (m.title) text += t('memory.memoryItemTitle', { title: m.title }) + '\n';
            if (m.tags && m.tags.length > 0) text += t('memory.memoryItemTags', { tags: m.tags.join(', ') }) + '\n';
            text += t('memory.memoryItemStats', { importance: m.importance, accessCount: m.accessCount, createdAt: m.createdAt });
            return text;
          }).join('\n\n');

      return {
        success: true,
        message: resultText,
        results: results.map(m => {
          const { _source, ...rest } = m;
          return rest;
        }),
        total: results.length,
        query,
        // 召回档位与语义命中数：供调用方（转发层/侧栏）展示"这次用到哪一档"，不改变其余字段
        tier,
        vectorMatched
      };
    });
  }

  /**
   * manage：审查（review）与压缩淘汰（compact）
   * （迁移自 executeAgentMemoryManage tool-memory.js:613-720；淘汰线 value<10 数值不变）
   * @param {object} args { action: 'review' | 'compact' }（扩展转发层已将 subAction 映射到 action）
   * @param {Function} t 请求语言翻译函数
   */
  async function manage(args, t) {
    const { action } = args;

    if (!action) return { success: false, error: t('memory.missingAction') };

    return withMemoryLock(async () => {
      const readResult = await readMemoryFile();
      if (!readResult.success) return { success: false, error: t('memory.readFailed', { error: readResult.error }) };

      const memoryData = readResult.data;
      const now = Date.now();

      if (action === 'review') {
        // 审查所有记忆，计算价值分数，返回淘汰建议
        const allMemories = [
          ...memoryData.facts.map(m => ({ ...m, _source: 'facts' })),
          ...memoryData.summaries.map(m => ({ ...m, _source: 'summaries' }))
        ];

        const scored = allMemories.map(m => ({
          id: m.id,
          type: m.type,
          category: m.category,
          content: m.content,
          title: m.title,
          tags: m.tags,
          importance: m.importance,
          accessCount: m.accessCount || 0,
          lastAccessAt: m.lastAccessAt,
          createdAt: m.createdAt,
          value: calcMemoryValue(m, now).toFixed(2),
          _source: m._source
        })).sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

        const factsCount = memoryData.facts.length;
        const summariesCount = memoryData.summaries.length;
        const maxFacts = memoryData.meta.maxFacts;
        const maxSummaries = memoryData.meta.maxSummaries;

        const lowValueThreshold = 10; // 价值分数低于此值标记为候选淘汰
        const candidates = scored.filter(s => parseFloat(s.value) < lowValueThreshold);

        const reviewText =
          t('memory.reviewTitle') + '\n\n' +
          t('memory.reviewOverview', { facts: factsCount, maxFacts, summaries: summariesCount, maxSummaries }) + '\n' +
          t('memory.reviewLastReview', { date: memoryData.stats.lastReviewAt || t('memory.reviewNeverReviewed') }) + '\n\n' +
          t('memory.reviewCandidates', { threshold: lowValueThreshold }) + '\n\n' +
          (candidates.length === 0
            ? t('memory.reviewNoCandidates') + '\n'
            : candidates.map((c, i) =>
                `${i + 1}. ` + t('memory.memoryItemHeader', { index: i + 1, type: c.type, id: c.id }) + ` (value: ${c.value})\n` +
                t('memory.memoryItemContent', { content: c.content }) + '\n' +
                t('memory.reviewItemCreated', { createdAt: c.createdAt, lastAccess: c.lastAccessAt || t('memory.neverAccessed'), accessCount: c.accessCount }) + '\n'
              ).join('\n')
          ) +
          '\n' + t('memory.reviewSuggestion') + '\n' +
          t('memory.reviewSuggestionDelete') + '\n' +
          t('memory.reviewSuggestionMerge') + '\n' +
          t('memory.reviewSuggestionKeep');

        return {
          success: true,
          message: reviewText,
          scored: scored.map(s => { const { _source, ...rest } = s; return rest; }),
          candidates: candidates.map(s => { const { _source, ...rest } = s; return rest; }),
          stats: memoryData.stats
        };
      }

      if (action === 'compact') {
        // 压缩：移除低价值记忆
        const threshold = 10;
        let removedFacts = 0;
        let removedSummaries = 0;

        const compactRemoved = [];
        memoryData.facts = memoryData.facts.filter(m => {
          const value = calcMemoryValue(m, now);
          if (value < threshold) {
            removedFacts++;
            compactRemoved.push(m.id);
            return false;
          }
          return true;
        });

        memoryData.summaries = memoryData.summaries.filter(m => {
          const value = calcMemoryValue(m, now);
          if (value < threshold) {
            removedSummaries++;
            compactRemoved.push(m.id);
            return false;
          }
          return true;
        });

        memoryData.stats.lastReviewAt = new Date().toISOString();

        const writeResult = await writeMemoryFile(memoryData);
        if (!writeResult.success) return { success: false, error: t('memory.writeFailed', { error: writeResult.error }) };

        // 已淘汰记忆从会话召回缓存中移除，避免后续会话永久占位
        for (const id of compactRemoved) removeFromRecalledCache(id);

        // 淘汰项的向量一并摘除：派生缓存可以整删重建，但不能指向已被压缩掉的条目
        if (compactRemoved.length) await vectors.dropVectors(compactRemoved);

        return {
          success: true,
          message: t('memory.compactDone', { facts: removedFacts, summaries: removedSummaries, threshold, totalFacts: memoryData.stats.totalFacts, totalSummaries: memoryData.stats.totalSummaries }),
          removedFacts,
          removedSummaries,
          stats: memoryData.stats
        };
      }

      return { success: false, error: t('memory.unsupportedAction', { action }) };
    });
  }

  /**
   * injectSelect：为系统提示词“永久注意事项”选出分级注入记忆（迁移自扩展端 GET_PERMANENT_NOTES handler）
   * 三级策略与预算参数由 injection.js 的 MEMORY_INJECTION_CONFIG 固定控制。
   * @param {Function} t 请求语言翻译函数
   */
  async function injectSelect(t) {
    return withMemoryLock(async () => {
      const readResult = await readMemoryFile();
      if (!readResult.success) return { success: false, error: t('memory.readFailed', { error: readResult.error }) };

      const memoryData = readResult.data;
      const selection = selectMemoriesForInjection(memoryData.facts, memoryData.summaries);

      return {
        success: true,
        injected: selection.injected,
        remainingCount: selection.remainingCount,
        remainingTags: selection.remainingTags
      };
    });
  }

  /**
   * 显式为全部记忆重建向量缓存（模型变更后或首次启用向量档时调用一次）。
   * 派生缓存：失败不影响正确性——recall 会按需补齐，最坏情况是这次少一条语义分。
   * @param {Function} t 请求语言翻译函数
   */
  async function backfillVectors(t) {
    const cfg = embeddingConfigProvider();
    const tier = tierResolver(cfg);
    if (!isVectorTier(tier)) {
      return { success: true, skipped: true, reason: t ? t('memory.embeddingDisabled') : 'embedding_disabled' };
    }
    const readResult = await readMemoryFile();
    if (!readResult.success) return { success: false, error: readResult.error };
    const data = readResult.data;
    const items = [...(data.facts || []), ...(data.summaries || [])].filter(m => m && m.id);
    if (!items.length) return { success: true, indexed: 0 };

    let provider;
    try {
      provider = getProvider().provider;
    } catch (err) {
      return { success: false, error: err.message };
    }

    const pairs = [];
    const errors = [];
    for (let i = 0; i < items.length; i += EMBED_BATCH_SIZE) {
      const batch = items.slice(i, i + EMBED_BATCH_SIZE);
      try {
        const vecs = await embedWithTimeout(provider.embedDocuments(batch.map(memorySearchText)));
        batch.forEach((m, j) => {
          if (Array.isArray(vecs) && Array.isArray(vecs[j]) && vecs[j].length) pairs.push([m.id, vecs[j]]);
        });
      } catch (err) {
        // 单批失败不中断整体：能建多少算多少，剩余条目后续 recall 时再补
        errors.push(err.message);
      }
    }
    if (!pairs.length) {
      return { success: false, indexed: 0, error: errors[0] || 'no_vectors' };
    }
    await vectors.upsertVectors(pairs, memoryModelKey(cfg));
    return { success: true, indexed: pairs.length, total: items.length, failedBatches: errors.length };
  }

  return {
    store,
    recall,
    manage,
    injectSelect,
    backfillVectors,
    // 读全部记忆数据对象（失败抛错；仅供测试与内部逻辑使用，业务方法内部用 readMemoryFile）
    readAll: async () => {
      const r = await readMemoryFile();
      if (!r.success) throw new Error(r.error);
      return r.data;
    },
    _internals: { withMemoryLock, sessionRecalledMemoryIds, removeFromRecalledCache, writeMemoryFile }
  };
}
