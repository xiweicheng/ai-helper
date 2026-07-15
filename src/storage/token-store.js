// storage/token-store.js - Token 使用统计的 IndexedDB CRUD

import { getDB, withStore } from './db.js';

const STORE_NAME = 'tokenStats';

// 全局汇总存储 key
const OVERALL_KEY = 'overall';

/**
 * 记录单次 API 调用的 token 使用
 * @param {Object} record
 * @param {string} record.sessionId
 * @param {string} record.model
 * @param {number} record.promptTokens
 * @param {number} record.completionTokens
 * @param {number} record.totalTokens
 * @param {number} record.contextWindow
 * @param {string} record.callType - 'react_loop' | 'non_stream' | 'reflection' | 'tool_reflection' | 'subtask_reflection'
 */
export function recordTokenCall(record) {
  const entry = {
    id: `tcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: record.sessionId,
    timestamp: new Date().toISOString(),
    model: record.model || 'unknown',
    promptTokens: record.promptTokens || 0,
    completionTokens: record.completionTokens || 0,
    totalTokens: record.totalTokens || 0,
    contextWindow: record.contextWindow || 128000,
    contextUsageRate: record.contextWindow > 0
      ? ((record.promptTokens || 0) / record.contextWindow)
      : 0,
    callType: record.callType || 'unknown'
  };

  return withStore(STORE_NAME, 'readwrite', (store, resolve) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
  });
}

/**
 * 获取某个会话的 token 汇总
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
export function getSessionTokenSummary(sessionId) {
  return withStore(STORE_NAME, 'readonly', (store, resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result || []).filter(r => 
        r.sessionId === sessionId || 
        (sessionId && r.sessionId?.startsWith(sessionId + '_'))
      );
      if (records.length === 0) {
        resolve({
          sessionId,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          apiCallCount: 0,
          avgContextUsageRate: 0,
          maxContextUsageRate: 0,
          minContextUsageRate: 0,
          records: []
        });
        return;
      }

      const usageRates = records.map(r => r.contextUsageRate || 0).filter(r => r > 0);
      resolve({
        sessionId,
        totalPromptTokens: records.reduce((s, r) => s + (r.promptTokens || 0), 0),
        totalCompletionTokens: records.reduce((s, r) => s + (r.completionTokens || 0), 0),
        totalTokens: records.reduce((s, r) => s + (r.totalTokens || 0), 0),
        apiCallCount: records.length,
        avgContextUsageRate: usageRates.length > 0
          ? usageRates.reduce((s, r) => s + r, 0) / usageRates.length
          : 0,
        maxContextUsageRate: usageRates.length > 0 ? Math.max(...usageRates) : 0,
        minContextUsageRate: usageRates.length > 0 ? Math.min(...usageRates) : 0,
        records: records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20)
      });
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * 获取全局 token 汇总
 * @returns {Promise<Object>}
 */
export function getOverallTokenSummary() {
  return withStore(STORE_NAME, 'readonly', (store, resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      if (records.length === 0) {
        resolve({
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          totalApiCalls: 0,
          totalSessions: 0,
          lastUpdated: null
        });
        return;
      }

      const sessionIds = new Set(records.map(r => r.sessionId).filter(Boolean));
      resolve({
        totalPromptTokens: records.reduce((s, r) => s + (r.promptTokens || 0), 0),
        totalCompletionTokens: records.reduce((s, r) => s + (r.completionTokens || 0), 0),
        totalTokens: records.reduce((s, r) => s + (r.totalTokens || 0), 0),
        totalApiCalls: records.length,
        totalSessions: sessionIds.size,
        lastUpdated: records.reduce((latest, r) => {
          return r.timestamp > latest ? r.timestamp : latest;
        }, '')
      });
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * 清除某个会话的 token 统计
 * @param {string} sessionId
 */
export function clearSessionTokenStats(sessionId) {
  return withStore(STORE_NAME, 'readwrite', (store, resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      const toDelete = records.filter(r => r.sessionId === sessionId);
      let deleted = 0;
      toDelete.forEach(r => {
        store.delete(r.id);
        deleted++;
      });
      resolve(deleted);
    };
    req.onerror = () => resolve(0);
  });
}

/**
 * 清除所有 token 统计
 */
export function clearAllTokenStats() {
  return withStore(STORE_NAME, 'readwrite', (store, resolve) => {
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
  });
}

/**
 * 获取最近 N 条 token 记录（全局）
 * @param {number} limit
 */
export function getRecentTokenRecords(limit = 20) {
  return withStore(STORE_NAME, 'readonly', (store, resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      resolve(records.slice(0, limit));
    };
    req.onerror = () => resolve([]);
  });
}
