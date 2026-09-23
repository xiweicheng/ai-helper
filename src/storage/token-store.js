// storage/token-store.js - Token 使用统计的 IndexedDB CRUD

import { getDB, withStore } from './db.js';

const STORE_NAME = 'tokenStats';

// 全局汇总存储 key
const OVERALL_KEY = 'overall';

// 系统级会话 ID：不计入"总会话数"，但其 Token 消耗仍计入总量
const SYSTEM_SESSION_IDS = new Set(['selection_toolbar']);

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
    // 使用 sessionId 索引 + key range 缩小候选集（精确匹配 + 子任务前缀 sessionId_xxx），
    // 避免 getAll() 全量加载所有会话的记录
    const index = store.index('sessionId');
    const req = sessionId
      ? index.getAll(IDBKeyRange.bound(sessionId, sessionId + '\uffff'))
      : store.getAll();
    req.onsuccess = () => {
      // 仍需精确过滤，确保语义与原实现一致（排除 sessionIdX 类前缀误匹配）
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

      const sessionIds = new Set(
        records.map(r => r.sessionId).filter(id => id && !SYSTEM_SESSION_IDS.has(id))
      );
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

// ==================== 阶段二：新增聚合查询接口 ====================

/**
 * 获取最近 N 天的每日 token 聚合
 * @param {number} days - 天数（默认 30）
 * @returns {Promise<Array<{date: string, totalTokens: number, apiCalls: number}>>}
 */
export function getDailyTokenSummary(days = 30) {
  return withStore(STORE_NAME, 'readonly', (store, resolve) => {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    // 使用 timestamp 索引下界，只读取区间内记录（ISO 字符串可按字典序比较）
    const index = store.index('timestamp');
    const req = index.getAll(IDBKeyRange.lowerBound(startDate.toISOString()));
    req.onsuccess = () => {
      const records = req.result || [];
      
      // 按天聚合
      const dailyMap = new Map();
      records.forEach(r => {
        const recordDate = new Date(r.timestamp);
        if (recordDate < startDate) return;
        
        const dateKey = recordDate.toISOString().split('T')[0]; // YYYY-MM-DD
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, { date: dateKey, totalTokens: 0, apiCalls: 0 });
        }
        const dayData = dailyMap.get(dateKey);
        dayData.totalTokens += r.totalTokens || 0;
        dayData.apiCalls += 1;
      });
      
      // 转换为数组并按日期排序
      const result = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      resolve(result);
    };
    req.onerror = () => resolve([]);
  });
}

/**
 * 按时间范围过滤的全局汇总
 * @param {string} startDate - ISO 日期字符串
 * @param {string} endDate - ISO 日期字符串
 * @returns {Promise<Object>} 同 getOverallTokenSummary 结构
 */
export function getOverallTokenSummaryByRange(startDate, endDate) {
  return withStore(STORE_NAME, 'readonly', (store, resolve) => {
    // 使用 timestamp 索引限定区间，只读取范围内的记录
    const index = store.index('timestamp');
    const req = index.getAll(IDBKeyRange.bound(startDate, endDate));
    req.onsuccess = () => {
      const records = req.result || [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // 二次精确过滤（防御 ISO 格式差异导致的字典序偏差）
      const filtered = records.filter(r => {
        const recordDate = new Date(r.timestamp);
        return recordDate >= start && recordDate <= end;
      });
      
      if (filtered.length === 0) {
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
      
      const sessionIds = new Set(
        filtered.map(r => r.sessionId).filter(id => id && !SYSTEM_SESSION_IDS.has(id))
      );
      resolve({
        totalPromptTokens: filtered.reduce((s, r) => s + (r.promptTokens || 0), 0),
        totalCompletionTokens: filtered.reduce((s, r) => s + (r.completionTokens || 0), 0),
        totalTokens: filtered.reduce((s, r) => s + (r.totalTokens || 0), 0),
        totalApiCalls: filtered.length,
        totalSessions: sessionIds.size,
        lastUpdated: filtered.reduce((latest, r) => {
          return r.timestamp > latest ? r.timestamp : latest;
        }, '')
      });
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * 按模型聚合的 token 分布
 * @returns {Promise<Array<{model: string, totalTokens: number, percentage: number}>>}
 */
export function getTokenSummaryByModel() {
  return withStore(STORE_NAME, 'readonly', (store, resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      const modelMap = new Map();
      
      records.forEach(r => {
        const model = r.model || 'unknown';
        if (!modelMap.has(model)) {
          modelMap.set(model, 0);
        }
        modelMap.set(model, modelMap.get(model) + (r.totalTokens || 0));
      });
      
      const totalTokens = Array.from(modelMap.values()).reduce((s, v) => s + v, 0);
      const result = Array.from(modelMap.entries())
        .map(([model, tokens]) => ({
          model,
          totalTokens: tokens,
          percentage: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens);
      
      resolve(result);
    };
    req.onerror = () => resolve([]);
  });
}

/**
 * 按 callType 聚合的 token 分布
 * @returns {Promise<Array<{callType: string, totalTokens: number, percentage: number}>>}
 */
export function getTokenSummaryByCallType() {
  return withStore(STORE_NAME, 'readonly', (store, resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      const callTypeMap = new Map();
      
      records.forEach(r => {
        const callType = r.callType || 'unknown';
        if (!callTypeMap.has(callType)) {
          callTypeMap.set(callType, 0);
        }
        callTypeMap.set(callType, callTypeMap.get(callType) + (r.totalTokens || 0));
      });
      
      const totalTokens = Array.from(callTypeMap.values()).reduce((s, v) => s + v, 0);
      const result = Array.from(callTypeMap.entries())
        .map(([callType, tokens]) => ({
          callType,
          totalTokens: tokens,
          percentage: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens);
      
      resolve(result);
    };
    req.onerror = () => resolve([]);
  });
}
