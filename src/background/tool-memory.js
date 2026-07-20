// background/tool-memory.js - 长期记忆工具
// 从 tool-executor.js 拆分，包含 agent_memory_store / agent_memory_recall / agent_memory_manage 工具实现

import * as AgentClient from './local-agent-client.js';
import logger from '../shared/logger.js';
import { makeResult } from './tool-helpers.js';

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
    return { success: false, error: `记忆文件解析失败: ${e.message}` };
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
 * agent_memory_store - 存储/更新/删除长期记忆
 */
export async function executeAgentMemoryStore(args, toolCallId) {
  const { action, type, category, content, title, tags, importance, memoryId, sourceSessionId } = args;

  if (!action) return makeResult(false, '缺少 action 参数', toolCallId);
  if (!type) return makeResult(false, '缺少 type 参数', toolCallId);
  if (!content && action !== 'delete') return makeResult(false, '缺少 content 参数', toolCallId);

  // 读取现有记忆文件
  const readResult = await readMemoryFile();
  if (!readResult.success) return makeResult(false, `读取记忆文件失败: ${readResult.error}`, toolCallId);

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
      if (!writeResult.success) return makeResult(false, `写入记忆文件失败: ${writeResult.error}`, toolCallId);
      return {
        ...makeResult(true, `已更新已有记忆: ${duplicate.id}（内容相同，已合并）`, toolCallId),
        memory: duplicate,
        action: 'updated',
        stats: memoryData.stats
      };
    }

    targetArray.push(newMemory);
    const writeResult = await writeMemoryFile(memoryData);
    if (!writeResult.success) return makeResult(false, `写入记忆文件失败: ${writeResult.error}`, toolCallId);

    // 检查是否接近上限
    const maxFacts = memoryData.meta.maxFacts;
    const maxSummaries = memoryData.meta.maxSummaries;
    const factRatio = memoryData.facts.length / maxFacts;
    const summaryRatio = memoryData.summaries.length / maxSummaries;
    let warning = '';
    if (factRatio >= 0.8 || summaryRatio >= 0.8) {
      warning = `\n⚠️ 记忆数量接近上限（事实: ${memoryData.facts.length}/${maxFacts}, 摘要: ${memoryData.summaries.length}/${maxSummaries}），建议调用 agent_memory_manage 进行审查整理。`;
    }

    return {
      ...makeResult(true, `已添加记忆: ${newMemory.id} (${type})${warning}`, toolCallId),
      memory: newMemory,
      action: 'added',
      stats: memoryData.stats
    };
  }

  if (action === 'update') {
    if (!memoryId) return makeResult(false, 'update 操作需要 memoryId 参数', toolCallId);

    const idx = targetArray.findIndex(m => m.id === memoryId);
    if (idx === -1) {
      // 尝试在另一个数组中查找
      const otherArray = type === 'fact' ? memoryData.summaries : memoryData.facts;
      const otherIdx = otherArray.findIndex(m => m.id === memoryId);
      if (otherIdx !== -1) {
        return makeResult(false, `记忆 ${memoryId} 类型不匹配（实际类型: ${otherArray[otherIdx].type}）`, toolCallId);
      }
      return makeResult(false, `未找到记忆: ${memoryId}`, toolCallId);
    }

    const existing = targetArray[idx];
    if (content !== undefined) existing.content = content;
    if (tags !== undefined) existing.tags = tags;
    if (importance !== undefined) existing.importance = importance;
    if (category !== undefined) existing.category = category;
    if (type === 'summary' && title !== undefined) existing.title = title;
    existing.updatedAt = now;

    const writeResult = await writeMemoryFile(memoryData);
    if (!writeResult.success) return makeResult(false, `写入记忆文件失败: ${writeResult.error}`, toolCallId);

    return {
      ...makeResult(true, `已更新记忆: ${memoryId}`, toolCallId),
      memory: existing,
      action: 'updated',
      stats: memoryData.stats
    };
  }

  if (action === 'delete') {
    if (!memoryId) return makeResult(false, 'delete 操作需要 memoryId 参数', toolCallId);

    const idx = targetArray.findIndex(m => m.id === memoryId);
    if (idx === -1) {
      const otherArray = type === 'fact' ? memoryData.summaries : memoryData.facts;
      const otherIdx = otherArray.findIndex(m => m.id === memoryId);
      if (otherIdx !== -1) {
        const removed = otherArray.splice(otherIdx, 1)[0];
        const writeResult = await writeMemoryFile(memoryData);
        if (!writeResult.success) return makeResult(false, `写入记忆文件失败: ${writeResult.error}`, toolCallId);
        return {
          ...makeResult(true, `已删除记忆: ${memoryId}`, toolCallId),
          removed,
          stats: memoryData.stats
        };
      }
      return makeResult(false, `未找到记忆: ${memoryId}`, toolCallId);
    }

    const removed = targetArray.splice(idx, 1)[0];
    const writeResult = await writeMemoryFile(memoryData);
    if (!writeResult.success) return makeResult(false, `写入记忆文件失败: ${writeResult.error}`, toolCallId);

    return {
      ...makeResult(true, `已删除记忆: ${memoryId}`, toolCallId),
      removed,
      stats: memoryData.stats
    };
  }

  return makeResult(false, `不支持的操作: ${action}`, toolCallId);
}

// 每 session 已召回的记忆 ID 集合，防止同一对话重复返回相同记忆
const sessionRecalledMemoryIds = new Map();

/**
 * agent_memory_recall - 从长期记忆中检索相关信息
 */
export async function executeAgentMemoryRecall(args, toolCallId, sessionId) {
  const { query, tags, memoryType = 'all', limit = 10 } = args;

  const readResult = await readMemoryFile();
  if (!readResult.success) return makeResult(false, `读取记忆文件失败: ${readResult.error}`, toolCallId);

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
      ...makeResult(true, '记忆文件为空，暂无存储的记忆。', toolCallId),
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
     * - CJK 文本（无空格）：使用二元组（bigram）提取，如"长期记忆"→["长期","期记","记忆"]
     * - 英文/数字：保持完整单词
     */
    function extractKeywords(text) {
      const clean = text.toLowerCase().trim();
      // 取前 200 字符避免 bigram 膨胀
      const snippet = clean.length > 200 ? clean.slice(0, 200) : clean;
      // 按语义边界拆分：CJK 连续块 | 字母连续块 | 数字连续块 | 分隔符
      const segments = snippet.split(/([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+|[a-z]+|\d+|[^a-z\d\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+)/i);

      const tokens = [];
      for (const seg of segments) {
        if (!seg || seg.trim().length === 0) continue;

        if (/^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(seg)) {
          // CJK 字符块：滑动窗口取二元组
          for (let i = 0; i <= seg.length - 2; i++) {
            tokens.push(seg.substring(i, i + 2));
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
        .filter(k => k.length >= 2 && !STOP_WORDS.has(k))
        .slice(0, 30);
    }

    const keywords = extractKeywords(query);

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

        return { memory: m, score };
      });

      // 有匹配关键词的才返回，按分数排序
      candidates = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.memory);
    }
  }

  // 去重（同一记忆可能同时在 facts 和 summaries 中？不会，但还是处理一下）
  const seen = new Set();
  let results = candidates.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  }).slice(0, limit);

  // Session 级去重：排除本对话已召回过的记忆
  let alreadyRecalled = [];
  if (sessionId) {
    const recalledSet = sessionRecalledMemoryIds.get(sessionId);
    if (recalledSet && recalledSet.size > 0) {
      const newResults = [];
      for (const m of results) {
        if (recalledSet.has(m.id)) {
          alreadyRecalled.push(m);
        } else {
          newResults.push(m);
        }
      }
      // 如果全部已召回过，告知 LLM 无需重复
      if (newResults.length === 0 && results.length > 0) {
        return {
          success: true,
          message: '当前对话中已检索过所有相关记忆，无需重复。如有新的检索需求，请提供不同的关键词。',
          results: [],
          total: 0,
          alreadyRecalledCount: alreadyRecalled.length,
          query,
          tool_call_id: toolCallId
        };
      }
      results = newResults;
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
    ? '未找到匹配的记忆。'
    : `找到 ${results.length} 条相关记忆:\n\n` + results.map((m, i) => {
        let text = `**${i + 1}. [${m.type === 'fact' ? '事实' : '摘要'}] ${m.id}**\n`;
        text += `   内容: ${m.content}\n`;
        if (m.title) text += `   标题: ${m.title}\n`;
        if (m.tags && m.tags.length > 0) text += `   标签: ${m.tags.join(', ')}\n`;
        text += `   重要性: ${m.importance}/10 | 访问: ${m.accessCount}次 | 创建: ${m.createdAt}`;
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
}

/**
 * agent_memory_manage - 管理长期记忆：审查、压缩、淘汰
 */
export async function executeAgentMemoryManage(args, toolCallId) {
  const { action } = args;

  if (!action) return makeResult(false, '缺少 action 参数', toolCallId);

  const readResult = await readMemoryFile();
  if (!readResult.success) return makeResult(false, `读取记忆文件失败: ${readResult.error}`, toolCallId);

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
      `## 记忆审查报告\n\n` +
      `**概况**: 事实 ${factsCount}/${maxFacts}, 摘要 ${summariesCount}/${maxSummaries}\n` +
      `**上次审查**: ${memoryData.stats.lastReviewAt || '从未审查'}\n\n` +
      `**低价值记忆候选** (价值 < ${lowValueThreshold}):\n\n` +
      (candidates.length === 0
        ? '无候选淘汰项，所有记忆价值良好。\n'
        : candidates.map((c, i) =>
            `${i + 1}. **[${c.type}] ${c.id}** (价值: ${c.value})\n` +
            `   内容: ${c.content}\n` +
            `   创建: ${c.createdAt} | 最后访问: ${c.lastAccessAt || '从未'} | 访问: ${c.accessCount}次\n`
          ).join('\n')
      ) +
      `\n**建议操作**:\n` +
      `- 对于确实过时/不再适用的记忆，使用 agent_memory_store action=delete 删除\n` +
      `- 对于内容相似的记忆，使用 agent_memory_store action=update 合并\n` +
      `- 对于仍有用但价值低的记忆，可保留不做处理`;

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
    if (!writeResult.success) return makeResult(false, `写入记忆文件失败: ${writeResult.error}`, toolCallId);

    return {
      ...makeResult(true, `记忆压缩完成。移除了 ${removedFacts} 条事实记忆和 ${removedSummaries} 条摘要记忆（价值低于 ${threshold}）。当前: 事实 ${memoryData.stats.totalFacts}, 摘要 ${memoryData.stats.totalSummaries}`, toolCallId),
      removedFacts,
      removedSummaries,
      stats: memoryData.stats
    };
  }

  return makeResult(false, `不支持的操作: ${action}`, toolCallId);
}


// 导出记忆工具函数供 tool-executor.js 路由表使用
