// side_panel/token-stats-panel.js - Token 使用统计面板（Tab 化布局）

import { getSessionTokenSummary, getOverallTokenSummary, clearSessionTokenStats, clearAllTokenStats, getDailyTokenSummary, getOverallTokenSummaryByRange, getTokenSummaryByModel, getTokenSummaryByCallType } from '../storage/token-store.js';
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
    // 新增：Tab 名称
    tabTrend: '趋势',
    tabDistribution: '分布',
    tabGlobal: '全局',
    // 新增：顶部卡片标签
    topCardSessionTokens: '本次 Token',
    topCardSessionCalls: '本次调用',
    topCardContextPeak: '上下文峰值',
    // 新增：sparkline 标签
    sparklineTitle: '最近 20 次调用趋势',
    // 新增：分布 Tab
    distPromptVsCompletion: 'Prompt / Completion 占比',
    distPrompt: 'Prompt',
    distCompletion: 'Completion',
    distByModel: '按模型分布',
    distByCallType: '按调用类型分布',
    distNoData: '暂无分布数据',
    // 新增：全局 Tab
    globalSparklineTitle: '最近 30 天趋势',
    globalNoDailyData: '所选范围内暂无数据',
    globalTotalTokens: '总 Token',
    globalTotalSessions: '总会话数',
    globalTotalApiCalls: '总 API 调用',
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
    // New: Tab names
    tabTrend: 'Trend',
    tabDistribution: 'Distribution',
    tabGlobal: 'Global',
    // New: Top card labels
    topCardSessionTokens: 'Session Tokens',
    topCardSessionCalls: 'Session Calls',
    topCardContextPeak: 'Context Peak',
    // New: sparkline label
    sparklineTitle: 'Last 20 Calls Trend',
    // New: Distribution Tab
    distPromptVsCompletion: 'Prompt / Completion Ratio',
    distPrompt: 'Prompt',
    distCompletion: 'Completion',
    distByModel: 'By Model',
    distByCallType: 'By Call Type',
    distNoData: 'No distribution data',
    // New: Global Tab
    globalSparklineTitle: 'Last 30 Days Trend',
    globalNoDailyData: 'No data in selected range',
    globalTotalTokens: 'Total Tokens',
    globalTotalSessions: 'Total Sessions',
    globalTotalApiCalls: 'Total API Calls',
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
  const tabNav = document.getElementById('tokenStatsTabNav');
  const topCards = document.getElementById('tokenStatsTopCards');

  if (!overlay) return;

  // 当前激活的 Tab
  let activeTab = 'trend';
  // 当前全局 Tab 的时间范围：today | week | month | all
  let activeRange = 'month';

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

  // Tab 切换逻辑
  if (tabNav) {
    tabNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.token-tab-btn');
      if (!btn) return;
      const tabId = btn.dataset.tab;
      if (tabId === activeTab) return;

      // 更新按钮样式
      tabNav.querySelectorAll('.token-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderBottomColor = 'transparent';
        b.style.color = '#666';
      });
      btn.classList.add('active');
      btn.style.borderBottomColor = '#667eea';
      btn.style.color = '#667eea';

      // 切换内容区
      document.querySelectorAll('.token-tab-content').forEach(content => {
        content.style.display = 'none';
      });
      const targetContent = document.getElementById(`tokenTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
      // 全局 Tab 用 flex 纵向布局撑满内容区（图表 flex:1 自适应高度）
      if (targetContent) targetContent.style.display = (tabId === 'global') ? 'flex' : '';

      activeTab = tabId;
    });

    // 初始化 Tab 按钮样式
    const activeBtn = tabNav.querySelector('.token-tab-btn.active');
    if (activeBtn) {
      activeBtn.style.borderBottomColor = '#667eea';
      activeBtn.style.color = '#667eea';
    }
  }

  // 全局 Tab 时间范围切换
  const timeRangeBtns = document.querySelectorAll('.token-time-range-btn');
  timeRangeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const range = btn.dataset.range;
      if (range === activeRange) return;
      activeRange = range;
      timeRangeBtns.forEach(b => {
        b.classList.remove('active');
        b.style.border = '1px solid #ddd';
        b.style.background = 'white';
        b.style.color = '#666';
      });
      btn.classList.add('active');
      btn.style.border = '1px solid #667eea';
      btn.style.background = '#667eea';
      btn.style.color = 'white';
      renderGlobal();
    });
  });

  async function loadTokenStats() {
    const sessionId = getActiveSessionId();
    const loading = document.getElementById('tokenStatsLoading');
    const empty = document.getElementById('tokenStatsEmpty');
    const content = document.getElementById('tokenStatsContent');

    if (loading) loading.style.display = '';
    if (empty) empty.style.display = 'none';
    if (content) content.style.display = 'none';
    if (tabNav) tabNav.style.display = 'none';
    if (topCards) topCards.style.display = 'none';

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
      if (tabNav) tabNav.style.display = 'flex';
      if (topCards) topCards.style.display = '';

      // 渲染顶部固定卡片
      renderTopCards(sessionSummary);

      // 渲染各 Tab 内容
      renderSessionSummary(sessionSummary);
      renderRecentCalls(sessionSummary.records || []);
      renderDistribution(overallSummary);
      renderGlobal();
    } catch (err) {
      logger.error('[TokenStats] load stats failed:', err);
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.textContent = t('tokenStats.loadFailed');
        empty.style.display = '';
      }
    }
  }

  // 渲染顶部固定卡片（3 个核心数字）
  function renderTopCards(s) {
    if (!topCards) return;
    if (!s || s.apiCallCount === 0) {
      topCards.innerHTML = '';
      return;
    }

    const peakRate = s.maxContextUsageRate || 0;
    const peakColor = getPressureColor(peakRate);

    topCards.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
        <div style="background: #f8f9ff; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 10px; color: #888; margin-bottom: 4px;">${t('tokenStats.topCardSessionTokens')}</div>
          <div style="font-size: 18px; font-weight: 700; color: #333;">${formatNumber(s.totalTokens)}</div>
        </div>
        <div style="background: #f0fdf4; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 10px; color: #888; margin-bottom: 4px;">${t('tokenStats.topCardSessionCalls')}</div>
          <div style="font-size: 18px; font-weight: 700; color: #333;">${s.apiCallCount}</div>
        </div>
        <div style="background: ${peakColor}15; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 10px; color: #888; margin-bottom: 4px;">${t('tokenStats.topCardContextPeak')}</div>
          <div style="font-size: 18px; font-weight: 700; color: ${peakColor};">${(peakRate * 100).toFixed(1)}%</div>
        </div>
      </div>`;
  }

  function renderSessionSummary(s) {
    const el = document.getElementById('tokenSessionStats');
    if (!el) return;
    if (!s || s.apiCallCount === 0) {
      el.innerHTML = `<div style="text-align:center;color:#999;padding:20px;">${t('tokenStats.currentSessionNoData')}</div>`;
      return;
    }

    // 生成 sparkline（最近 20 次调用的 token 消耗趋势）
    const sparklineSvg = renderSparkline(s.records || []);

    // 区间条（min-avg-max 合并为一根条）
    const rangeBar = renderRangeBar(s.minContextUsageRate, s.avgContextUsageRate, s.maxContextUsageRate);

    el.innerHTML = `
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #888; margin-bottom: 6px;">${t('tokenStats.sparklineTitle')}</div>
        ${sparklineSvg}
      </div>
      <div style="margin-bottom: 10px;">
        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">${t('tokenStats.contextUsageRate')}</div>
        ${rangeBar}
      </div>
      <div style="display: flex; gap: 10px; font-size: 11px; color: #666;">
        <span>Prompt: ${formatNumber(s.totalPromptTokens)}</span>
        <span>Completion: ${formatNumber(s.totalCompletionTokens)}</span>
      </div>`;
  }

  // 渲染 sparkline（纯 SVG 手写，约 200×40px）
  function renderSparkline(records) {
    if (!records || records.length === 0) {
      return '<div style="height: 40px; background: #f5f5f5; border-radius: 4px;"></div>';
    }

    // 取最近 20 条记录，按时间正序（旧→新）
    const data = records.slice(0, 20).reverse().map(r => r.totalTokens || 0);
    const maxVal = Math.max(...data, 1);
    const width = 280;
    const height = 40;
    const padding = 2;

    // 生成点坐标
    const points = data.map((val, i) => {
      const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - (val / maxVal) * (height - 2 * padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width: 100%; height: ${height}px; display: block; background: #fafafa; border-radius: 4px;">
        <polyline points="${points}" fill="none" stroke="#667eea" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${data.map((val, i) => {
          const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding);
          const y = height - padding - (val / maxVal) * (height - 2 * padding);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#667eea"><title>${formatNumber(val)} tokens</title></circle>`;
        }).join('')}
      </svg>`;
  }

  // 渲染区间条（min-avg-max 三点合并为一根水平条）
  function renderRangeBar(min, avg, max) {
    const minPct = Math.min((min || 0) * 100, 100);
    const avgPct = Math.min((avg || 0) * 100, 100);
    const maxPct = Math.min((max || 0) * 100, 100);
    const color = getPressureColor(max || 0);

    return `
      <div style="position: relative; height: 20px; background: #e8e8e8; border-radius: 10px; overflow: visible;">
        <!-- min 到 max 之间的填充 -->
        <div style="position: absolute; left: ${minPct}%; width: ${maxPct - minPct}%; height: 100%; background: ${color}40; border-radius: 10px;"></div>
        <!-- min 标记点 -->
        <div style="position: absolute; left: ${minPct}%; top: 50%; transform: translate(-50%, -50%); width: 8px; height: 8px; background: #10b981; border-radius: 50%; border: 2px solid white;"></div>
        <!-- avg 标记点 -->
        <div style="position: absolute; left: ${avgPct}%; top: 50%; transform: translate(-50%, -50%); width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; border: 2px solid white;"></div>
        <!-- max 标记点 -->
        <div style="position: absolute; left: ${maxPct}%; top: 50%; transform: translate(-50%, -50%); width: 8px; height: 8px; background: ${color}; border-radius: 50%; border: 2px solid white;"></div>
        <!-- 标签 -->
        <div style="position: absolute; left: ${minPct}%; top: -14px; transform: translateX(-50%); font-size: 9px; color: #10b981;">${(min * 100).toFixed(0)}%</div>
        <div style="position: absolute; left: ${avgPct}%; top: -14px; transform: translateX(-50%); font-size: 9px; color: #f59e0b;">${(avg * 100).toFixed(0)}%</div>
        <div style="position: absolute; left: ${maxPct}%; top: -14px; transform: translateX(-50%); font-size: 9px; color: ${color};">${(max * 100).toFixed(0)}%</div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px; color: #999;">
        <span>${t('tokenStats.min')}</span>
        <span>${t('tokenStats.avg')}</span>
        <span>${t('tokenStats.max')}</span>
      </div>`;
  }

  // callType 中文/本地化标签映射
  function getCallTypeLabel(callType) {
    const map = {
      'react_loop': 'ReAct',
      'non_stream': t('tokenStats.callTypeNonStream'),
      'stream': t('tokenStats.callTypeStream'),
      'reflection': t('tokenStats.callTypeReflection'),
      'tool_reflection': t('tokenStats.callTypeToolReflection'),
      'subtask_reflection': t('tokenStats.callTypeSubtaskReflection'),
      'unknown': '-'
    };
    return map[callType] || callType;
  }

  // ==================== Tab 2：分布 ====================
  async function renderDistribution(overallSummary) {
    const el = document.getElementById('tokenDistributionStats');
    if (!el) return;

    try {
      const [byModel, byCallType] = await Promise.all([
        getTokenSummaryByModel(),
        getTokenSummaryByCallType()
      ]);

      const totalPrompt = overallSummary?.totalPromptTokens || 0;
      const totalCompletion = overallSummary?.totalCompletionTokens || 0;

      if (totalPrompt + totalCompletion === 0 && byModel.length === 0) {
        el.innerHTML = `<div style="text-align:center;color:#999;padding:20px;">${t('tokenStats.distNoData')}</div>`;
        return;
      }

      el.innerHTML = `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px;">${t('tokenStats.distPromptVsCompletion')}</div>
          ${renderStackedBar(totalPrompt, totalCompletion)}
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px;">${t('tokenStats.distByModel')}</div>
          ${renderHorizontalBars(byModel.map(m => ({ label: m.model, value: m.totalTokens, percentage: m.percentage })), '#667eea')}
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px;">${t('tokenStats.distByCallType')}</div>
          ${renderHorizontalBars(byCallType.map(c => ({ label: getCallTypeLabel(c.callType), value: c.totalTokens, percentage: c.percentage })), '#10b981')}
        </div>`;
    } catch (err) {
      logger.error('[TokenStats] render distribution failed:', err);
      el.innerHTML = `<div style="text-align:center;color:#999;padding:20px;">${t('tokenStats.loadFailed')}</div>`;
    }
  }

  // Prompt / Completion 堆叠条
  function renderStackedBar(prompt, completion) {
    const total = prompt + completion;
    if (total === 0) {
      return `<div style="text-align:center;color:#999;font-size:11px;padding:8px;">${t('tokenStats.distNoData')}</div>`;
    }
    const promptPct = (prompt / total) * 100;
    const completionPct = (completion / total) * 100;

    return `
      <div style="display:flex;height:22px;border-radius:6px;overflow:hidden;background:#f0f0f0;">
        <div style="width:${promptPct}%;background:#667eea;" title="Prompt: ${formatNumber(prompt)}"></div>
        <div style="width:${completionPct}%;background:#f59e0b;" title="Completion: ${formatNumber(completion)}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;">
        <span style="display:flex;align-items:center;gap:4px;color:#666;">
          <span style="width:8px;height:8px;border-radius:2px;background:#667eea;display:inline-block;"></span>
          ${t('tokenStats.distPrompt')} ${formatNumber(prompt)} (${promptPct.toFixed(1)}%)
        </span>
        <span style="display:flex;align-items:center;gap:4px;color:#666;">
          <span style="width:8px;height:8px;border-radius:2px;background:#f59e0b;display:inline-block;"></span>
          ${t('tokenStats.distCompletion')} ${formatNumber(completion)} (${completionPct.toFixed(1)}%)
        </span>
      </div>`;
  }

  // 水平条形图（按占比降序）
  function renderHorizontalBars(items, color) {
    if (!items || items.length === 0) {
      return `<div style="text-align:center;color:#999;font-size:11px;padding:8px;">${t('tokenStats.distNoData')}</div>`;
    }
    const maxVal = Math.max(...items.map(i => i.value || 0), 1);

    return items.map(item => {
      const barWidth = (item.value / maxVal) * 100;
      return `<div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#555;margin-bottom:3px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">${escapeHtml(item.label)}</span>
          <span style="color:#999;">${formatNumber(item.value)} · ${(item.percentage || 0).toFixed(1)}%</span>
        </div>
        <div style="height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${barWidth}%;background:${color};border-radius:4px;"></div>
        </div>
      </div>`;
    }).join('');
  }

  // ==================== Tab 3：全局 ====================
  async function renderGlobal() {
    const sparklineEl = document.getElementById('tokenGlobalSparkline');
    const statsEl = document.getElementById('tokenOverallStats');
    if (!sparklineEl || !statsEl) return;

    // 根据时间范围计算 startDate / endDate
    const now = new Date();
    const end = now.toISOString();
    let start;
    let days;
    if (activeRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      days = 1;
    } else if (activeRange === 'week') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      days = 7;
    } else if (activeRange === 'month') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      days = 30;
    } else {
      start = new Date(0).toISOString();
      days = 365;
    }

    try {
      const [daily, rangeSummary] = await Promise.all([
        getDailyTokenSummary(days),
        getOverallTokenSummaryByRange(start, end)
      ]);

      // 全局 sparkline（按天聚合）
      sparklineEl.innerHTML = renderDailySparkline(daily);

      // 全局统计卡片
      if (!rangeSummary || rangeSummary.totalApiCalls === 0) {
        statsEl.innerHTML = `<div style="text-align:center;color:#999;padding:16px;font-size:12px;">${t('tokenStats.globalNoDailyData')}</div>`;
        return;
      }
      statsEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div style="background:#fff7ed;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:#888;">${t('tokenStats.globalTotalTokens')}</div>
            <div style="font-size:16px;font-weight:700;color:#333;">${formatNumber(rangeSummary.totalTokens)}</div>
          </div>
          <div style="background:#f0f9ff;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:#888;">${t('tokenStats.globalTotalSessions')}</div>
            <div style="font-size:16px;font-weight:700;color:#333;">${rangeSummary.totalSessions}</div>
          </div>
          <div style="background:#fdf2f8;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:#888;">${t('tokenStats.globalTotalApiCalls')}</div>
            <div style="font-size:16px;font-weight:700;color:#333;">${rangeSummary.totalApiCalls}</div>
          </div>
        </div>`;
    } catch (err) {
      logger.error('[TokenStats] render global failed:', err);
      statsEl.innerHTML = `<div style="text-align:center;color:#999;padding:16px;font-size:12px;">${t('tokenStats.loadFailed')}</div>`;
    }
  }

  // 每日趋势 sparkline（面积图）
  function renderDailySparkline(daily) {
    if (!daily || daily.length === 0) {
      return `<div style="height:100%;min-height:80px;background:#f5f5f5;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:11px;">${t('tokenStats.globalNoDailyData')}</div>`;
    }

    const data = daily.map(d => d.totalTokens || 0);
    const maxVal = Math.max(...data, 1);
    const width = 300;
    const height = 170;
    const padding = 3;
    const n = data.length;

    const xAt = (i) => padding + (n === 1 ? (width - 2 * padding) / 2 : (i / (n - 1)) * (width - 2 * padding));
    const yAt = (val) => height - padding - (val / maxVal) * (height - 2 * padding);

    const linePoints = data.map((val, i) => `${xAt(i).toFixed(1)},${yAt(val).toFixed(1)}`).join(' ');
    const areaPoints = `${xAt(0).toFixed(1)},${height - padding} ${linePoints} ${xAt(n - 1).toFixed(1)},${height - padding}`;

    return `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:100%;display:block;background:#fafafa;border-radius:4px;">
        <polygon points="${areaPoints}" fill="#667eea20"/>
        <polyline points="${linePoints}" fill="none" stroke="#667eea" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${data.map((val, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(val).toFixed(1)}" r="2" fill="#667eea"><title>${daily[i].date}: ${formatNumber(val)} tokens / ${daily[i].apiCalls} calls</title></circle>`).join('')}
      </svg>`;
  }

  function renderRecentCalls(records) {
    const el = document.getElementById('tokenRecentCalls');
    if (!el) return;
    if (!records || records.length === 0) {
      el.innerHTML = '';
      return;
    }

    // 计算最大值用于微型柱条
    const maxTokens = Math.max(...records.slice(0, 10).map(r => r.totalTokens || 0), 1);

    el.innerHTML = records.slice(0, 10).map((r, i) => {
      const time = new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const typeLabel = getCallTypeLabel(r.callType);
      const barWidth = ((r.totalTokens || 0) / maxTokens) * 100;
      const barColor = getPressureColor(r.contextUsageRate || 0);

      return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:11px;">
        <span style="color:#999;width:20px;">#${i + 1}</span>
        <div style="width:40px;height:12px;background:#f0f0f0;border-radius:2px;overflow:hidden;flex-shrink:0;">
          <div style="height:100%;width:${barWidth}%;background:${barColor};"></div>
        </div>
        <span style="color:#666;width:55px;">${time}</span>
        <span style="background:#f0f0f5;padding:1px 5px;border-radius:3px;font-size:9px;color:#666;">${escapeHtml(typeLabel)}</span>
        <span style="font-weight:500;color:#333;margin-left:auto;">${formatNumber(r.totalTokens)}</span>
        <span style="color:${barColor};font-size:9px;font-weight:500;width:35px;text-align:right;">${((r.contextUsageRate || 0) * 100).toFixed(1)}%</span>
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
}
