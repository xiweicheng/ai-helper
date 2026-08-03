// background/tool-memory.js - 长期记忆工具
// 统一入口 executeAgentMemory，按 action 分发到 store/recall/manage 子逻辑

import * as AgentClient from './local-agent-client.js';
import logger from '../shared/logger.js';
import { makeResult } from './tool-helpers.js';
import { t, registerTranslations } from '../shared/i18n.js';

// 注册 toolMemory 命名空间翻译
registerTranslations('zh', {
  toolMemory: {
    missingAction: '缺少 action 参数',
    missingType: '缺少 type 参数',
    missingContent: '缺少 content 参数',
    readFailed: '读取记忆文件失败: {error}',
    writeFailed: '写入记忆文件失败: {error}',
    parseFailed: '记忆文件解析失败: {error}',
    updatedDuplicate: '已更新已有记忆: {id}（内容相同，已合并）',
    added: '已添加记忆: {id} ({type}){warning}',
    nearLimitWarning: '\n⚠️ 记忆数量接近上限（事实: {facts}/{maxFacts}, 摘要: {summaries}/{maxSummaries}），建议调用 agent_memory action=manage 进行审查整理。',
    updateNeedsId: 'update 操作需要 memoryId 参数',
    deleteNeedsId: 'delete 操作需要 memoryId 参数',
    typeMismatch: '记忆 {id} 类型不匹配（实际类型: {type}）',
    notFound: '未找到记忆: {id}',
    updated: '已更新记忆: {id}',
    deleted: '已删除记忆: {id}',
    unsupportedAction: '不支持的操作: {action}',
    storeMissingSubAction: 'store 操作缺少 subAction (add/update/delete)',
    manageMissingSubAction: 'manage 操作缺少 subAction (review/compact)',
    unsupportedMemoryAction: '不支持的 action: {action}',
    memoryEmpty: '记忆文件为空，暂无存储的记忆。',
    noMatch: '未找到匹配的记忆。',
    foundResults: '找到 {count} 条相关记忆:{note}',
    recallNoteAllOld: '（注：以上记忆在本对话中已检索过，此处为重复返回）',
    recallNoteMixed: '（注：{oldCount} 条记忆在本对话中已检索过，仅返回新的 {newCount} 条）',
    compactDone: '记忆压缩完成。移除了 {facts} 条事实记忆和 {summaries} 条摘要记忆（价值低于 {threshold}）。当前: 事实 {totalFacts}, 摘要 {totalSummaries}',
    reviewTitle: '## 记忆审查报告',
    reviewOverview: '**概况**: 事实 {facts}/{maxFacts}, 摘要 {summaries}/{maxSummaries}',
    reviewLastReview: '**上次审查**: {date}',
    reviewNeverReviewed: '从未审查',
    reviewCandidates: '**低价值记忆候选** (价值 < {threshold}):',
    reviewNoCandidates: '无候选淘汰项，所有记忆价值良好。',
    reviewSuggestion: '**建议操作**:',
    reviewSuggestionDelete: '- 对于确实过时/不再适用的记忆，使用 agent_memory action=store subAction=delete 删除',
    reviewSuggestionMerge: '- 对于内容相似的记忆，使用 agent_memory action=store subAction=update 合并',
    reviewSuggestionKeep: '- 对于仍有用但价值低的记忆，可保留不做处理',
    factLabel: '事实',
    summaryLabel: '摘要',
    neverAccessed: '从未',
    memoryItemHeader: '**{index}. [{type}] {id}**',
    memoryItemContent: '   内容: {content}',
    memoryItemTitle: '   标题: {title}',
    memoryItemTags: '   标签: {tags}',
    memoryItemStats: '   重要性: {importance}/10 | 访问: {accessCount}次 | 创建: {createdAt}',
    reviewItemCreated: '   创建: {createdAt} | 最后访问: {lastAccess} | 访问: {accessCount}次',
  },
});

registerTranslations('en', {
  toolMemory: {
    missingAction: 'Missing action parameter',
    missingType: 'Missing type parameter',
    missingContent: 'Missing content parameter',
    readFailed: 'Failed to read memory file: {error}',
    writeFailed: 'Failed to write memory file: {error}',
    parseFailed: 'Memory file parse failed: {error}',
    updatedDuplicate: 'Updated existing memory: {id} (content identical, merged)',
    added: 'Added memory: {id} ({type}){warning}',
    nearLimitWarning: '\n⚠️ Memory count approaching limit (facts: {facts}/{maxFacts}, summaries: {summaries}/{maxSummaries}). Consider calling agent_memory action=manage to review and clean up.',
    updateNeedsId: 'update action requires memoryId parameter',
    deleteNeedsId: 'delete action requires memoryId parameter',
    typeMismatch: 'Memory {id} type mismatch (actual type: {type})',
    notFound: 'Memory not found: {id}',
    updated: 'Updated memory: {id}',
    deleted: 'Deleted memory: {id}',
    unsupportedAction: 'Unsupported action: {action}',
    storeMissingSubAction: 'store action missing subAction (add/update/delete)',
    manageMissingSubAction: 'manage action missing subAction (review/compact)',
    unsupportedMemoryAction: 'Unsupported action: {action}',
    memoryEmpty: 'Memory file is empty, no stored memories.',
    noMatch: 'No matching memories found.',
    foundResults: 'Found {count} relevant memories:{note}',
    recallNoteAllOld: '(Note: The above memories have already been retrieved in this conversation, returned again)',
    recallNoteMixed: '(Note: {oldCount} memories already retrieved in this conversation, only returning {newCount} new ones)',
    compactDone: 'Memory compaction complete. Removed {facts} fact memories and {summaries} summary memories (value below {threshold}). Current: facts {totalFacts}, summaries {totalSummaries}',
    reviewTitle: '## Memory Review Report',
    reviewOverview: '**Overview**: Facts {facts}/{maxFacts}, Summaries {summaries}/{maxSummaries}',
    reviewLastReview: '**Last review**: {date}',
    reviewNeverReviewed: 'Never reviewed',
    reviewCandidates: '**Low-value memory candidates** (value < {threshold}):',
    reviewNoCandidates: 'No candidates for removal, all memories have good value.',
    reviewSuggestion: '**Suggested actions**:',
    reviewSuggestionDelete: '- For outdated/no longer applicable memories, use agent_memory action=store subAction=delete to remove',
    reviewSuggestionMerge: '- For similar memories, use agent_memory action=store subAction=update to merge',
    reviewSuggestionKeep: '- For still useful but low-value memories, keep them as-is',
    factLabel: 'Fact',
    summaryLabel: 'Summary',
    neverAccessed: 'Never',
    memoryItemHeader: '**{index}. [{type}] {id}**',
    memoryItemContent: '   Content: {content}',
    memoryItemTitle: '   Title: {title}',
    memoryItemTags: '   Tags: {tags}',
    memoryItemStats: '   Importance: {importance}/10 | Access: {accessCount} times | Created: {createdAt}',
    reviewItemCreated: '   Created: {createdAt} | Last access: {lastAccess} | Access: {accessCount} times',
  },
});

// ==================== 记忆操作异步锁 ====================
// 防止并发 readMemoryFile → 修改 → writeMemoryFile 导致的竞态覆盖
let memoryLock = null;

/**
 * 获取记忆操作锁
 * @returns {Function} releaseLock - 释放锁的回调函数
 */
async function acquireMemoryLock() {
  while (memoryLock) {
    await memoryLock;
  }
  let release;
  memoryLock = new Promise(r => { release = r; });
  return () => {
    if (release) {
      release();
      memoryLock = null;
      release = null;
    }
  };
}

// ==================== 长期记忆工具 ====================

// 记忆文件路径（相对于 Agent 工作目录）
// 记忆文件存储在 Agent 配置目录下，通过 ~ 指向用户主目录与工作目录隔离
const MEMORY_FILE_PATH = '~/.ai-helper-agent/memory/global-memory.json';
const DEFAULT_MEMORY_DATA = {
  version: 1,
  updatedAt: new Date().toISOString(),
  stats: { totalFacts: 0, totalSummaries: 0, lastReviewAt: null },
  facts: [],
  summaries: [],
  meta: { maxFacts: 50, maxSummaries: 20, reviewThreshold: 0.8 }
};

/**
 * 读取记忆文件
 * @returns {{success: boolean, data?: object, error?: string}}
 */
export async function readMemoryFile() {
  const result = await AgentClient.readFile(MEMORY_FILE_PATH);
  if (!result.success) {
    // 文件不存在时返回空数据结构
    if (result.error && (result.error.includes('ENOENT') || result.error.includes('not found') || result.error.includes('不存在'))) {
      return { success: true, data: { ...DEFAULT_MEMORY_DATA, updatedAt: new Date().toISOString() } };
    }
    return { success: false, error: result.error };
  }
  try {
    const data = JSON.parse(result.content);
    // 确保数据结构完整
    return {
      success: true,
      data: {
        ...DEFAULT_MEMORY_DATA,
        ...data,
        meta: { ...DEFAULT_MEMORY_DATA.meta, ...(data.meta || {}) }
      }
    };
  } catch (e) {
    return { success: false, error: t('toolMemory.parseFailed', { error: e.message }) };
  }
}

/**
 * 写入记忆文件
 * @param {object} data - 要写入的记忆数据
 */
async function writeMemoryFile(data) {
  data.updatedAt = new Date().toISOString();
  data.stats.totalFacts = (data.facts || []).length;
  data.stats.totalSummaries = (data.summaries || []).length;
  data.version = data.version || 1;
  return AgentClient.writeFile(MEMORY_FILE_PATH, JSON.stringify(data, null, 2));
}

/**
 * 生成记忆ID
 */
function generateMemoryId(type) {
  const prefix = type === 'fact' ? 'fact' : 'sum';
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * 计算记忆价值分数（用于淘汰判断）
 */
function calcMemoryValue(memory, now) {
  const importance = memory.importance || 5;
  const accessCount = memory.accessCount || 0;
  const createdAt = new Date(memory.createdAt).getTime();
  const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);

  // 时间衰减因子
  let decay;
  if (ageDays <= 7) decay = 1.0;
  else if (ageDays <= 30) decay = 0.8;
  else if (ageDays <= 90) decay = 0.5;
  else decay = 0.2;

  return importance * (1 + Math.log(accessCount + 1)) * decay;
}

/**
 * 带锁保护的记忆操作包装器
 * 确保同一时刻只有一个 memory 操作在执行，防止 read-modify-write 竞态
 * @param {Function} task - 需要保护的异步任务
 * @returns {Promise} task 的返回值
 */
async function withMemoryLock(task) {
  const release = await acquireMemoryLock();
  try {
    return await task();
  } finally {
    release();
  }
}

/**
 * agent_memory_store - 存储/更新/删除长期记忆
 */
export async function executeAgentMemoryStore(args, toolCallId) {
  const { action, type, category, content, title, tags, importance, memoryId, sourceSessionId } = args;

  if (!action) return makeResult(false, t('toolMemory.missingAction'), toolCallId);
  // delete 不需要 type（memoryId 全局唯一），add/update 需要
  if (!type && action !== 'delete') return makeResult(false, t('toolMemory.missingType'), toolCallId);
  if (!content && action !== 'delete') return makeResult(false, t('toolMemory.missingContent'), toolCallId);

  return withMemoryLock(async () => {
      const readResult = await readMemoryFile();
      if (!readResult.success) return makeResult(false, t('toolMemory.readFailed', { error: readResult.error }), toolCallId);
  
    const memoryData = readResult.data;
    const now = new Date().toISOString();
    const targetArray = type === 'fact' ? memoryData.facts : memoryData.summaries;
  
    if (action === 'add') {
      // 新增记忆
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
        if (!writeResult.success) return makeResult(false, t('toolMemory.writeFailed', { error: writeResult.error }), toolCallId);
        return {
          ...makeResult(true, t('toolMemory.updatedDuplicate', { id: duplicate.id }), toolCallId),
          memory: duplicate,
          action: 'updated',
          stats: memoryData.stats
        };
      }
  
      targetArray.push(newMemory);
      const writeResult = await writeMemoryFile(memoryData);
      if (!writeResult.success) return makeResult(false, t('toolMemory.writeFailed', { error: writeResult.error }), toolCallId);

      // 检查是否接近上限
      const maxFacts = memoryData.meta.maxFacts;
      const maxSummaries = memoryData.meta.maxSummaries;
      const factRatio = memoryData.facts.length / maxFacts;
      const summaryRatio = memoryData.summaries.length / maxSummaries;
      let warning = '';
      if (factRatio >= 0.8 || summaryRatio >= 0.8) {
        warning = t('toolMemory.nearLimitWarning', { facts: memoryData.facts.length, maxFacts, summaries: memoryData.summaries.length, maxSummaries });
      }

      return {
        ...makeResult(true, t('toolMemory.added', { id: newMemory.id, type, warning }), toolCallId),
        memory: newMemory,
        action: 'added',
        stats: memoryData.stats
      };
    }
  
    if (action === 'update') {
      if (!memoryId) return makeResult(false, t('toolMemory.updateNeedsId'), toolCallId);

      const idx = targetArray.findIndex(m => m.id === memoryId);
      if (idx === -1) {
        // 尝试在另一个数组中查找
        const otherArray = type === 'fact' ? memoryData.summaries : memoryData.facts;
        const otherIdx = otherArray.findIndex(m => m.id === memoryId);
        if (otherIdx !== -1) {
          return makeResult(false, t('toolMemory.typeMismatch', { id: memoryId, type: otherArray[otherIdx].type }), toolCallId);
        }
        return makeResult(false, t('toolMemory.notFound', { id: memoryId }), toolCallId);
      }
  
      const existing = targetArray[idx];
      if (content !== undefined) existing.content = content;
      if (tags !== undefined) existing.tags = tags;
      if (importance !== undefined) existing.importance = importance;
      if (category !== undefined) existing.category = category;
      if (type === 'summary' && title !== undefined) existing.title = title;
      existing.updatedAt = now;
  
      const writeResult = await writeMemoryFile(memoryData);
      if (!writeResult.success) return makeResult(false, t('toolMemory.writeFailed', { error: writeResult.error }), toolCallId);
  
      return {
        ...makeResult(true, t('toolMemory.updated', { id: memoryId }), toolCallId),
        memory: existing,
        action: 'updated',
        stats: memoryData.stats
      };
    }
  
    if (action === 'delete') {
      if (!memoryId) return makeResult(false, t('toolMemory.deleteNeedsId'), toolCallId);

      // 在 facts 和 summaries 两个数组中查找（不依赖 type 参数）
      const arrays = [memoryData.facts, memoryData.summaries];
      for (const arr of arrays) {
        const idx = arr.findIndex(m => m.id === memoryId);
        if (idx !== -1) {
          const removed = arr.splice(idx, 1)[0];
          removeFromRecalledCache(memoryId);
          const writeResult = await writeMemoryFile(memoryData);
          if (!writeResult.success) return makeResult(false, t('toolMemory.writeFailed', { error: writeResult.error }), toolCallId);
          return {
            ...makeResult(true, t('toolMemory.deleted', { id: memoryId }), toolCallId),
            removed,
            stats: memoryData.stats
          };
        }
      }

      return makeResult(false, t('toolMemory.notFound', { id: memoryId }), toolCallId);
    }

    return makeResult(false, t('toolMemory.unsupportedAction', { action }), toolCallId);
    });
  }
  
  // 每 session 已召回的记忆 ID 集合，防止同一对话重复返回相同记忆
  const sessionRecalledMemoryIds = new Map();
  
  /**
   * 从所有 session 的召回缓存中移除指定 memoryId
   */
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
   * agent_memory_recall - 从长期记忆中检索相关信息
   */
  export async function executeAgentMemoryRecall(args, toolCallId, sessionId) {
    const { query, tags, memoryType = 'all', limit = 10 } = args;
  
  return withMemoryLock(async () => {
    const readResult = await readMemoryFile();
    if (!readResult.success) return makeResult(false, t('toolMemory.readFailed', { error: readResult.error }), toolCallId);
  
    const memoryData = readResult.data;
    const now = Date.now();
  
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
        ...makeResult(true, t('toolMemory.memoryEmpty'), toolCallId),
        results: [],
        total: 0
      };
    }
  
    // 按标签筛选
    if (tags && tags.length > 0) {
      candidates = candidates.filter(m => {
        const memTags = (m.tags || []).map(t => t.toLowerCase());
        return tags.some(t => memTags.includes(t.toLowerCase()));
      });
    }
  
    // 按关键词搜索
    if (query && query.trim()) {
      // 停用词列表：常见中英文虚词，避免噪音匹配
      const STOP_WORDS = new Set([
        '的', '是', '了', '在', '我', '你', '他', '她', '它', '们', '这', '那', '不', '也', '就',
        '都', '会', '要', '能', '可', '把', '被', '让', '给', '对', '从', '到', '和', '与', '或',
        '但', '而', '还', '又', '只', '很', '更', '最', '有', '没', '吗', '呢', '吧', '啊',
        '什么', '怎么', '为什么', '哪里', '哪个', '多少',
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
        'may', 'might', 'can', 'shall', 'must', 'need', 'dare',
        'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
        'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into',
        'and', 'or', 'not', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
        'so', 'no', 'up', 'out', 'just', 'now', 'here', 'there', 'all', 'each', 'every'
      ]);
  
      /**
       * 中英文混合关键词提取
       * - CJK 短文本（≤4字）：整段作为关键词保留，如"考试"→["考试"]
       * - CJK 长文本（>4字）：bigram 提取 + 整段作为 fallback 关键词
       * - 英文/数字：保持完整单词
       */
      function extractKeywords(text) {
        const clean = text.toLowerCase().trim();
        // 取前 200 字符避免 bigram 膨胀
        const snippet = clean.length > 200 ? clean.slice(0, 200) : clean;
        // 按语义边界拆分：CJK 连续块 | 字母连续块 | 数字连续块 | 分隔符
        const segments = snippet.split(/([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+|[a-z]+|\d+|[^a-z\d\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+)/i);
  
        const tokens = [];
        // 先将整段作为 fallback 关键词加入
        if (snippet.length >= 2) {
          tokens.push(snippet);
        }
        
        for (const seg of segments) {
          if (!seg || seg.trim().length === 0) continue;
  
          if (/^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(seg)) {
            // CJK 字符块
            if (seg.length <= 4) {
              // 短文本：整段作为关键词
              tokens.push(seg);
            } else {
              // 长文本：滑动窗口取二元组
              for (let i = 0; i <= seg.length - 2; i++) {
                tokens.push(seg.substring(i, i + 2));
              }
            }
          } else if (/^[a-z\d]+$/.test(seg)) {
            // 英文/数字：保持完整单词
            if (seg.length >= 2) {
              tokens.push(seg);
            }
          }
        }
        // 去重、过滤停用词、限制最多 30 个关键词（避免膨胀）
        return [...new Set(tokens)]
          .filter(k => k.length >= 1 && !STOP_WORDS.has(k))
          .slice(0, 30);
      }
  
      const keywords = extractKeywords(query);
      const originalQuery = query.toLowerCase().trim();
  
      if (keywords.length > 0) {
        const scored = candidates.map(m => {
          let score = 0;
          const content = (m.content || '').toLowerCase();
          const title = (m.title || '').toLowerCase();
          const memTags = (m.tags || []).map(t => t.toLowerCase());
  
          for (const kw of keywords) {
            if (content.includes(kw)) score += 3;
            if (title.includes(kw)) score += 2;
            if (memTags.some(t => t.includes(kw))) score += 2;
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
          
        // 全文 Fallback：关键词匹配无结果时，用原始 query 做 includes 搜索
        if (candidates.length === 0 && originalQuery.length >= 2) {
          const fallbackResults = candidates
            .filter(m => {
              const content = (m.content || '').toLowerCase();
              const title = (m.title || '').toLowerCase();
              return content.includes(originalQuery) || title.includes(originalQuery);
            })
            .map(m => ({ memory: m, score: 5 })) // 给 fallback 结果一个基础分
            .sort((a, b) => b.score - a.score)
            .map(s => s.memory);
            
          if (fallbackResults.length > 0) {
            candidates = fallbackResults;
          }
        }
      }
    }
  
    // 去重（同一记忆可能同时在 facts 和 summaries 中？不会，但还是处理一下）
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
          recallNote = t('toolMemory.recallNoteAllOld');
          results = oldResults;
        } else if (newResults.length > 0) {
          if (oldResults.length > 0) {
            recallNote = t('toolMemory.recallNoteMixed', { oldCount: oldResults.length, newCount: newResults.length });
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
    const updatedFacts = new Set();
    const updatedSummaries = new Set();
    for (const m of results) {
      const source = m._source === 'facts' ? memoryData.facts : memoryData.summaries;
      const found = source.find(sm => sm.id === m.id);
      if (found) {
        found.accessCount = (found.accessCount || 0) + 1;
        found.lastAccessAt = new Date().toISOString();
        delete m._source;
      }
    }
  
    // 写回更新后的访问计数（非关键操作，失败不阻塞返回）
    try {
      await writeMemoryFile(memoryData);
    } catch (e) {
      logger.warn('[Memory] 更新访问计数失败:', e.message);
    }
  
    // 格式化输出
    const resultText = results.length === 0
      ? t('toolMemory.noMatch')
      : t('toolMemory.foundResults', { count: results.length, note: recallNote }) + '\n\n' + results.map((m, i) => {
          let text = t('toolMemory.memoryItemHeader', { index: i + 1, type: m.type === 'fact' ? t('toolMemory.factLabel') : t('toolMemory.summaryLabel'), id: m.id }) + '\n';
          text += t('toolMemory.memoryItemContent', { content: m.content }) + '\n';
          if (m.title) text += t('toolMemory.memoryItemTitle', { title: m.title }) + '\n';
          if (m.tags && m.tags.length > 0) text += t('toolMemory.memoryItemTags', { tags: m.tags.join(', ') }) + '\n';
          text += t('toolMemory.memoryItemStats', { importance: m.importance, accessCount: m.accessCount, createdAt: m.createdAt });
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
      tool_call_id: toolCallId
    };
    });
  }
  
  /**
   * agent_memory_manage - 管理长期记忆：审查、压缩、淘汰
   */
  export async function executeAgentMemoryManage(args, toolCallId) {
    const { action } = args;
  
    if (!action) return makeResult(false, t('toolMemory.missingAction'), toolCallId);
  
  return withMemoryLock(async () => {
    const readResult = await readMemoryFile();
    if (!readResult.success) return makeResult(false, t('toolMemory.readFailed', { error: readResult.error }), toolCallId);
  
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
        t('toolMemory.reviewTitle') + '\n\n' +
        t('toolMemory.reviewOverview', { facts: factsCount, maxFacts, summaries: summariesCount, maxSummaries }) + '\n' +
        t('toolMemory.reviewLastReview', { date: memoryData.stats.lastReviewAt || t('toolMemory.reviewNeverReviewed') }) + '\n\n' +
        t('toolMemory.reviewCandidates', { threshold: lowValueThreshold }) + '\n\n' +
        (candidates.length === 0
          ? t('toolMemory.reviewNoCandidates') + '\n'
          : candidates.map((c, i) =>
              `${i + 1}. ` + t('toolMemory.memoryItemHeader', { index: i + 1, type: c.type, id: c.id }) + ` (${t('toolMemory.factLabel') === '事实' ? 'value' : 'value'}: ${c.value})\n` +
              t('toolMemory.memoryItemContent', { content: c.content }) + '\n' +
              t('toolMemory.reviewItemCreated', { createdAt: c.createdAt, lastAccess: c.lastAccessAt || t('toolMemory.neverAccessed'), accessCount: c.accessCount }) + '\n'
            ).join('\n')
        ) +
        '\n' + t('toolMemory.reviewSuggestion') + '\n' +
        t('toolMemory.reviewSuggestionDelete') + '\n' +
        t('toolMemory.reviewSuggestionMerge') + '\n' +
        t('toolMemory.reviewSuggestionKeep');
  
      return {
        ...makeResult(true, reviewText, toolCallId),
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
  
      memoryData.facts = memoryData.facts.filter(m => {
        const value = calcMemoryValue(m, now);
        if (value < threshold) {
          removedFacts++;
          return false;
        }
        return true;
      });
  
      memoryData.summaries = memoryData.summaries.filter(m => {
        const value = calcMemoryValue(m, now);
        if (value < threshold) {
          removedSummaries++;
          return false;
        }
        return true;
      });
  
      memoryData.stats.lastReviewAt = new Date().toISOString();
  
      const writeResult = await writeMemoryFile(memoryData);
      if (!writeResult.success) return makeResult(false, t('toolMemory.writeFailed', { error: writeResult.error }), toolCallId);
  
      return {
        ...makeResult(true, t('toolMemory.compactDone', { facts: removedFacts, summaries: removedSummaries, threshold, totalFacts: memoryData.stats.totalFacts, totalSummaries: memoryData.stats.totalSummaries }), toolCallId),
        removedFacts,
        removedSummaries,
        stats: memoryData.stats
      };
    }
  
    return makeResult(false, t('toolMemory.unsupportedAction', { action }), toolCallId);
    });
  }
  
  
  // 导出记忆工具函数供 tool-executor.js 路由表使用

/**
 * agent_memory - 统一记忆管理入口，按 action 分发
 */
export async function executeAgentMemory(args, toolCallId, sessionId) {
  const { action, subAction } = args;

  if (!action) return makeResult(false, t('toolMemory.missingAction'), toolCallId);

  if (action === 'recall') {
    return executeAgentMemoryRecall(args, toolCallId, sessionId);
  }

  if (action === 'store') {
    // 将 subAction 映射为原 store 函数期望的 action 参数
    if (!subAction) return makeResult(false, t('toolMemory.storeMissingSubAction'), toolCallId);
    const storeArgs = { ...args, action: subAction };
    return executeAgentMemoryStore(storeArgs, toolCallId);
  }

  if (action === 'manage') {
    // 将 subAction 映射为原 manage 函数期望的 action 参数
    if (!subAction) return makeResult(false, t('toolMemory.manageMissingSubAction'), toolCallId);
    const manageArgs = { ...args, action: subAction };
    return executeAgentMemoryManage(manageArgs, toolCallId);
  }

  return makeResult(false, t('toolMemory.unsupportedMemoryAction', { action }), toolCallId);
}