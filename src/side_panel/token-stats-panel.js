// side_panel/token-stats-panel.js - Token 使用统计面板

import { getSessionTokenSummary, getOverallTokenSummary, clearSessionTokenStats, clearAllTokenStats } from '../storage/token-store.js';
import { escapeHtml } from './utils.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  tokenStats: {
    clearConfirmMessage: '确定要清空所有 Token 使用统计吗？此操作不可撤销。',
    loadFailed: '加载失败',
    currentSessionNoData: '当前会话暂无数据',
    totalTokenUsage: '总 Token 消耗',
    apiCallCount: 'API 调用次数',
    contextUsageRate: '上下文使用率',
    max: '最大',
    avg: '平均',
    min: '最小',
    totalTokens: '总 Token',
    totalSessions: '总会话数',
    totalApiCalls: '总 API 调用',
    callTypeNonStream: '普通',
    callTypeStream: '流式',
    callTypeReflection: '反思',
    callTypeToolReflection: '工具反思',
    callTypeSubtaskReflection: '子任务反思',
  },
});
registerTranslations('en', {
  tokenStats: {
    clearConfirmMessage: 'Are you sure you want to clear all Token usage statistics? This action cannot be undone.',
    loadFailed: 'Load failed',
    currentSessionNoData: 'No data for current session',
    totalTokenUsage: 'Total Token Usage',
    apiCallCount: 'API Call Count',
    contextUsageRate: 'Context Usage Rate',
    max: 'Max',
    avg: 'Avg',
    min: 'Min',
    totalTokens: 'Total Tokens',
    totalSessions: 'Total Sessions',
    totalApiCalls: 'Total API Calls',
    callTypeNonStream: 'Normal',
    callTypeStream: 'Stream',
    callTypeReflection: 'Reflection',
    callTypeToolReflection: 'Tool Reflection',
    callTypeSubtaskReflection: 'Subtask Reflection',
  },
});

/**
 * 初始化 Token 统计面板
 * @param {function(): string} getActiveSessionId - 获取当前活跃会话 ID
 * @param {function(string, string): Promise<boolean>} showCustomConfirm - 自定义确认弹窗
 */
export function initTokenStatsPanel(getActiveSessionId, showCustomConfirm) {
  const overlay = document.getElementById('tokenStatsOverlay');
  const closeBtn = document.getElementById('tokenStatsClose');
  const refreshBtn = document.getElementById('tokenStatsRefreshBtn');
  const clearBtn = document.getElementById('tokenStatsClearBtn');

  if (!overlay) return;

  function open() {
    overlay.style.display = 'flex';
    loadTokenStats();
  }

  function close() {
    overlay.style.display = 'none';
  }

  // 暴露全局 open 函数
  window.openTokenStats = open;

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', loadTokenStats);
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm(t('tokenStats.clearConfirmMessage'), t('toolStats.clearTitle'));
      if (!confirmed) return;
      await clearAllTokenStats();
      loadTokenStats();
    });
  }

  async function loadTokenStats() {
    const sessionId = getActiveSessionId();
    const loading = document.getElementById('tokenStatsLoading');
    const empty = document.getElementById('tokenStatsEmpty');
    const content = document.getElementById('tokenStatsContent');

    if (loading) loading.style.display = '';
    if (empty) empty.style.display = 'none';
    if (content) content.style.display = 'none';

    try {
      const [sessionSummary, overallSummary] = await Promise.all([
        getSessionTokenSummary(sessionId),
        getOverallTokenSummary()
      ]);

      if (loading) loading.style.display = 'none';

      const hasData = overallSummary && overallSummary.totalApiCalls > 0;
      if (!hasData) {
        if (empty) empty.style.display = '';
        return;
      }

      if (content) content.style.display = '';
      renderSessionSummary(sessionSummary);
      renderOverallSummary(overallSummary);
      renderRecentCalls(sessionSummary.records || []);
    } catch (err) {
      logger.error('[TokenStats] 加载统计失败:', err);
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.textContent = t('tokenStats.loadFailed');
        empty.style.display = '';
      }
    }
  }

  function renderSessionSummary(s) {
    const el = document.getElementById('tokenSessionStats');
    if (!el) return;
    if (!s || s.apiCallCount === 0) {
      el.innerHTML = `<div style="text-align:center;color:#999;padding:20px;">${t('tokenStats.currentSessionNoData')}</div>`;
      return;
    }
    const pctPrompt = s.totalTokens > 0 ? ((s.totalPromptTokens / s.totalTokens) * 100).toFixed(1) : 0;
    const pctCompletion = s.totalTokens > 0 ? ((s.totalCompletionTokens / s.totalTokens) * 100).toFixed(1) : 0;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:#f8f9ff;border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">${t('tokenStats.totalTokenUsage')}</div>
          <div style="font-size:20px;font-weight:700;color:#333;">${formatNumber(s.totalTokens)}</div>
        </div>
        <div style="background:#f0fdf4;border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">${t('tokenStats.apiCallCount')}</div>
          <div style="font-size:20px;font-weight:700;color:#333;">${s.apiCallCount}</div>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;font-size:12px;color:#666;">
        <span>Prompt: ${formatNumber(s.totalPromptTokens)} (${pctPrompt}%)</span>
        <span>Completion: ${formatNumber(s.totalCompletionTokens)} (${pctCompletion}%)</span>
      </div>
      <div style="margin-top:8px;">
        <div style="font-size:11px;color:#888;margin-bottom:4px;">${t('tokenStats.contextUsageRate')}</div>
        ${renderUsageBar(t('tokenStats.max'), s.maxContextUsageRate)}
        ${renderUsageBar(t('tokenStats.avg'), s.avgContextUsageRate)}
        ${renderUsageBar(t('tokenStats.min'), s.minContextUsageRate)}
      </div>`;
  }

  function renderOverallSummary(o) {
    const el = document.getElementById('tokenOverallStats');
    if (!el) return;
    if (!o || o.totalApiCalls === 0) return;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div style="background:#fff7ed;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:#888;">${t('tokenStats.totalTokens')}</div>
          <div style="font-size:16px;font-weight:700;color:#333;">${formatNumber(o.totalTokens)}</div>
        </div>
        <div style="background:#f0f9ff;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:#888;">${t('tokenStats.totalSessions')}</div>
          <div style="font-size:16px;font-weight:700;color:#333;">${o.totalSessions}</div>
        </div>
        <div style="background:#fdf2f8;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:#888;">${t('tokenStats.totalApiCalls')}</div>
          <div style="font-size:16px;font-weight:700;color:#333;">${o.totalApiCalls}</div>
        </div>
      </div>`;
  }

  function renderRecentCalls(records) {
    const el = document.getElementById('tokenRecentCalls');
    if (!el) return;
    if (!records || records.length === 0) {
      el.innerHTML = '';
      return;
    }

    const callTypeLabels = {
      'react_loop': 'ReAct',
      'non_stream': t('tokenStats.callTypeNonStream'),
      'stream': t('tokenStats.callTypeStream'),
      'reflection': t('tokenStats.callTypeReflection'),
      'tool_reflection': t('tokenStats.callTypeToolReflection'),
      'subtask_reflection': t('tokenStats.callTypeSubtaskReflection')
    };

    el.innerHTML = records.slice(0, 10).map((r, i) => {
      const time = new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const typeLabel = callTypeLabels[r.callType] || r.callType;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12px;">
        <span style="color:#999;">#${i + 1}</span>
        <span style="color:#666;">${time}</span>
        <span style="background:#f0f0f5;padding:1px 6px;border-radius:3px;font-size:10px;color:#666;">${escapeHtml(typeLabel)}</span>
        <span style="font-weight:500;color:#333;">${formatNumber(r.totalTokens)}</span>
        <span style="color:${getPressureColor(r.contextUsageRate)};font-size:10px;font-weight:500;">${(r.contextUsageRate * 100).toFixed(1)}%</span>
      </div>`;
    }).join('');
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  // 上下文使用率压力分级配色：< 50% 安全(绿)，50-80% 警告(橙)，>= 80% 危险(红)
  function getPressureColor(rate) {
    if (rate >= 0.8) return '#ef4444';
    if (rate >= 0.5) return '#f59e0b';
    return '#10b981';
  }

  // 渲染单根使用率进度条：标签 + 进度条(宽度=该值) + 数值
  // 一根条只对应一个值，避免标签与数值在空间上错位
  function renderUsageBar(label, rate) {
    const pct = (rate * 100).toFixed(1);
    const width = Math.min(rate * 100, 100);
    const color = getPressureColor(rate);
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <span style="font-size:11px;color:#999;width:32px;flex-shrink:0;">${label}</span>
        <div style="flex:1;height:6px;background:#e8e8e8;border-radius:3px;overflow:hidden;">
          <div style="height:100%;background:${color};border-radius:3px;width:${width}%;transition:width 0.3s ease;"></div>
        </div>
        <span style="font-size:11px;color:${color};font-weight:600;min-width:42px;text-align:right;">${pct}%</span>
      </div>`;
  }
}
