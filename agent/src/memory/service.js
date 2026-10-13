// agent/src/memory/service.js - 长期记忆业务逻辑（自扩展端 tool-memory.js 下推，行为不变）
// 逻辑与数据文件同进程：fs 直接读写 MEMORY_DIR/global-memory.json，互斥锁进程内生效。
// store/recall/manage 按 action 分发；文案经调用方传入的请求语言 t 闭包渲染。

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { MEMORY_DIR } from '../config.js';
import { calcMemoryValue, selectMemoriesForInjection } from './injection.js';
import { extractKeywords } from './tokens.js';

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

/**
 * 创建记忆服务实例
 * @param {{filePath?: string}} [options] filePath 可注入（测试用），缺省 MEMORY_DIR/global-memory.json
 * @returns {{store: (args: object, t: Function) => Promise<object>, readAll: () => Promise<object>}}
 */
export function createMemoryService({ filePath = join(MEMORY_DIR, 'global-memory.json') } = {}) {
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
          query
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
      if (query && query.trim()) {
        const keywords = extractKeywords(query);
        const originalQuery = query.toLowerCase().trim();

        if (keywords.length > 0) {
          const scored = candidates.map(m => {
            let score = 0;
            const content = (m.content || '').toLowerCase();
            const title = (m.title || '').toLowerCase();
            const memTags = (m.tags || []).map(tg => tg.toLowerCase());

            for (const kw of keywords) {
              if (content.includes(kw)) score += 3;
              if (title.includes(kw)) score += 2;
              if (memTags.some(tg => tg.includes(kw))) score += 2;
            }

            // 全文精确匹配加分
            if (originalQuery.length >= 2) {
              if (content.includes(originalQuery)) score += 5;
              if (title.includes(originalQuery)) score += 3;
            }

            return { memory: m, score };
          });

          // 有匹配关键词的才返回，按分数排序
          candidates = scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(s => s.memory);

          // 迁移说明：原扩展端（tool-memory.js:499-513）的"全文 fallback"分支过滤的是已被
          // 上一行赋值清空的 candidates 数组，恒返回空，属死代码，未随迁——行为等价。
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
        query
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

  return {
    store,
    recall,
    manage,
    injectSelect,
    // 读全部记忆数据对象（失败抛错；仅供测试与内部逻辑使用，业务方法内部用 readMemoryFile）
    readAll: async () => {
      const r = await readMemoryFile();
      if (!r.success) throw new Error(r.error);
      return r.data;
    },
    _internals: { withMemoryLock, sessionRecalledMemoryIds, removeFromRecalledCache, writeMemoryFile }
  };
}
