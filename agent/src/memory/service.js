// agent/src/memory/service.js - 长期记忆业务逻辑（自扩展端 tool-memory.js 下推，行为不变）
// 逻辑与数据文件同进程：fs 直接读写 MEMORY_DIR/global-memory.json，互斥锁进程内生效。
// store/recall/manage 按 action 分发；文案经调用方传入的请求语言 t 闭包渲染。

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { MEMORY_DIR } from '../config.js';

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

  // ==================== 会话召回缓存（recall 使用；迁移自 tool-memory.js:350-364） ====================
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

  return {
    store,
    // 读全部记忆数据对象（失败抛错；仅供测试与内部逻辑使用，业务方法内部用 readMemoryFile）
    readAll: async () => {
      const r = await readMemoryFile();
      if (!r.success) throw new Error(r.error);
      return r.data;
    },
    _internals: { withMemoryLock, sessionRecalledMemoryIds, removeFromRecalledCache, writeMemoryFile }
  };
}
