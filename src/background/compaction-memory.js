// background/compaction-memory.js - 会话压缩摘要沉淀为跨会话长期记忆
// 摘要本身由 agent 端存储（/api/memory/store），本模块只做整形与转发；
// 沉淀是压缩的增益，任何失败都不抛出、不影响已成功的压缩结果。
import { agentRequest } from './local-agent-client.js';
import { t, registerTranslations } from '../shared/i18n.js';
import logger from '../shared/logger.js';

registerTranslations('zh', {
  compactionMemory: {
    contentHeader: '[会话压缩摘要 r{revision} · 已压缩 {count} 条]',
    title: '会话摘要 {date}',
  },
});
registerTranslations('en', {
  compactionMemory: {
    contentHeader: '[Session compaction summary r{revision} · {count} messages compacted]',
    title: 'Session summary {date}',
  },
});

// 摘要属于"决策/结论"类记忆：importance 6（Tier2 按需注入，不常驻系统提示词）
const SUMMARY_IMPORTANCE = 6;
const STORE_TIMEOUT_MS = 30000;

/**
 * 把压缩摘要写入长期记忆。同一会话复用同一 memoryId 走 update，避免每次重压缩堆条目。
 * @param {object} input
 * @param {string} input.summary - 摘要正文
 * @param {string} [input.sessionId]
 * @param {string|null} [input.memoryId] - 已沉淀条目的 ID（有则 update）
 * @param {number} [input.compressedCount]
 * @param {number} [input.revision]
 * @returns {Promise<{ ok: boolean, memoryId: string|null }>}
 */
export async function persistCompactionSummary({
  summary,
  sessionId = null,
  memoryId = null,
  compressedCount = 0,
  revision = 1,
} = {}) {
  const text = (summary || '').trim();
  if (!text) return { ok: false, memoryId: memoryId ?? null };

  const body = {
    action: memoryId ? 'update' : 'add',
    type: 'summary',
    category: 'decision',
    content: `${t('compactionMemory.contentHeader', { revision, count: compressedCount })}\n${text}`,
    title: t('compactionMemory.title', { date: new Date().toISOString().slice(0, 10) }),
    tags: ['compaction', ...(sessionId ? [`session:${sessionId}`] : [])],
    importance: SUMMARY_IMPORTANCE,
    sourceSessionId: sessionId || null,
  };
  if (memoryId) body.memoryId = memoryId;

  try {
    const resp = await agentRequest('/api/memory/store', body, 'POST', STORE_TIMEOUT_MS);
    if (!resp?.success) {
      // Agent 未连接 / 旧版本缺端点：静默降级，压缩摘要仍在会话内可用
      logger.warn('[CompactionMemory] store failed:', resp?.error || resp?.httpStatus || 'unknown');
      return { ok: false, memoryId: memoryId ?? null };
    }
    return { ok: true, memoryId: resp.memory?.id || memoryId || null };
  } catch (err) {
    logger.warn('[CompactionMemory] store exception:', err?.message);
    return { ok: false, memoryId: memoryId ?? null };
  }
}
