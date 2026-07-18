// side_panel/chat-panels.js - 聊天面板渲染函数
// 从 chat-manager.js 拆分，包含执行日志面板与反思信息面板的渲染逻辑

import { escapeHtml, formatDuration } from './utils.js';

// ============================================================
// 反思信息面板
// ============================================================
/**
 * 显示质量评估详情弹窗
 */
function showReflectionInfo(data, anchorBtn) {
  // 关闭已存在的弹窗
  const existing = document.querySelector('.reflection-info-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'reflection-info-overlay';

  const { overallScore, dimensions, issues, suggestions, decision, useful, reasoning, suggestion, rounds, wasRevised } = data;

  const scoreColor = overallScore >= 8 ? 'score-high' : (overallScore >= 5 ? 'score-mid' : 'score-low');
  const scoreEmoji = overallScore >= 8 ? '✅' : (overallScore >= 5 ? '🔍' : '⚠️');
  const decisionLabel = decision === 'passed' ? '✅ 通过' : (decision === 'revised' ? '🔧 已修订' : (decision === 'needs_improvement' ? '⚠️ 需改进' : ''));

  const dimLabels = {
    accuracy: '准确性',
    completeness: '完整性',
    relevance: '相关性',
    clarity: '清晰度',
    usefulness: '实用性',
    safety: '安全性',
    efficiency: '效率'
  };

  let dimensionsHtml = '';
  if (dimensions && Object.keys(dimensions).length > 0) {
    dimensionsHtml = `
      <div class="ri-section">
        <div class="ri-section-title">📊 各维度评分</div>
        <div class="ri-dimensions">
          ${Object.entries(dimensions).map(([key, val]) => {
            const label = dimLabels[key] || key;
            const dimColor = val >= 8 ? '#10b981' : (val >= 5 ? '#f59e0b' : '#ef4444');
            return `
              <div class="ri-dim-item">
                <span class="ri-dim-label">${escapeHtml(label)}</span>
                <span class="ri-dim-bar-bg"><span class="ri-dim-bar-fill" style="width:${val * 10}%;background:${dimColor}"></span></span>
                <span class="ri-dim-score" style="color:${dimColor}">${val}/10</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  let issuesHtml = '';
  if (issues && issues.length > 0) {
    issuesHtml = `
      <div class="ri-section">
        <div class="ri-section-title">📋 发现的问题</div>
        <ul class="ri-list">${issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
      </div>
    `;
  }

  let suggestionsHtml = '';
  if (suggestions && suggestions.length > 0) {
    suggestionsHtml = `
      <div class="ri-section">
        <div class="ri-section-title">💡 改进建议</div>
        <ul class="ri-list">${suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </div>
    `;
  }

  let processHtml = '';
  if (rounds > 0 || decision || useful !== null) {
    const processItems = [];
    if (rounds > 0) processItems.push(`<span class="ri-tag">🔄 经过 ${rounds} 轮评估${wasRevised ? '（已修订）' : ''}</span>`);
    if (decision) processItems.push(`<span class="ri-tag">🎯 最终决策: ${decisionLabel}</span>`);
    if (useful !== null) processItems.push(`<span class="ri-tag">${useful ? '✅ AI 认为结果有用' : '⚠️ AI 认为结果需要改进'}</span>`);
    if (reasoning) processItems.push(`<div class="ri-reasoning">📝 ${escapeHtml(reasoning)}</div>`);

    processHtml = `
      <div class="ri-section">
        <div class="ri-section-title">🔍 评估过程</div>
        <div class="ri-process">${processItems.join('')}</div>
      </div>
    `;
  }

  // 评分说明
  const scoreExplanation = overallScore >= 8
    ? 'AI 认为回答质量较高，准确性和完整性良好，可以直接使用。'
    : (overallScore >= 5
      ? 'AI 认为回答存在一些不足，建议核实关键信息或补充细节后再使用。'
      : 'AI 认为回答质量较低，可能存在较多错误或遗漏，建议重新提问或调整问题表述。');

  overlay.innerHTML = `
    <div class="reflection-info-panel">
      <div class="ri-header">
        <div class="ri-title">质量评估详情</div>
        <button class="ri-close" title="关闭">✕</button>
      </div>
      <div class="ri-body">
        <div class="ri-score-overview">
          <span class="ri-score-emoji">${scoreEmoji}</span>
          <span class="ri-score-value ${scoreColor}">${overallScore}<span class="ri-score-max">/10</span></span>
          <span class="ri-score-label">综合评分</span>
        </div>
        <div class="ri-section">
          <div class="ri-section-title">📖 评分说明</div>
          <p class="ri-text">${scoreExplanation}</p>
        </div>
        ${dimensionsHtml}
        ${issuesHtml}
        ${suggestionsHtml}
        ${processHtml}
        <div class="ri-section ri-about">
          <div class="ri-section-title">ℹ️ 什么是质量评估？</div>
          <p class="ri-text">质量评估是 AI 在生成回答后，对自己的回答进行的<strong>自我反思和评分</strong>。AI 会从准确性、完整性、相关性等多个维度审视回答质量，发现潜在问题并尝试改进。</p>
          <p class="ri-text ri-text-sm">评分标准：<span style="color:#10b981">✅ 8-10分 质量良好</span> · <span style="color:#f59e0b">🔍 5-7分 需要关注</span> · <span style="color:#ef4444">⚠️ 1-4分 存在较多问题</span></p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 关闭事件
  const closeBtn = overlay.querySelector('.ri-close');
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // 定位弹窗：靠近触发按钮
  const btnRect = anchorBtn.getBoundingClientRect();
  const panel = overlay.querySelector('.reflection-info-panel');
  const panelWidth = 380;
  const panelMaxHeight = Math.min(window.innerHeight - 40, 560);

  // 水平定位：面板右边缘对齐按钮右边缘
  let left = btnRect.right - panelWidth;
  if (left < 10) left = 10;
  if (left + panelWidth > window.innerWidth - 10) left = window.innerWidth - panelWidth - 10;

  // 垂直定位：面板顶部略低于按钮底部
  let top = btnRect.bottom + 6;
  if (top + panelMaxHeight > window.innerHeight - 10) {
    top = btnRect.top - panelMaxHeight - 6;
  }
  if (top < 10) top = 10;

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.maxHeight = panelMaxHeight + 'px';
}


// ============================================================

function showExecutionLog(executionLog) {
  const existingPanel = document.querySelector('.execution-log-panel');
  if (existingPanel) {
    existingPanel.remove();
  }
  
  const panel = document.createElement('div');
  panel.className = 'execution-log-panel';
  
  const totalDuration = executionLog.reduce((sum, entry) => sum + (entry.duration || 0), 0);
  const successCount = executionLog.filter(entry => entry.status === 'success').length;
  const failedCount = executionLog.filter(entry => entry.status === 'failed').length;
  const subtaskCount = executionLog.filter(entry => entry.nodeType === 'subtask').length;
  const completedSubtasks = executionLog.filter(entry => entry.nodeType === 'subtask' && entry.status === 'success').length;
  const planTaskCount = executionLog.filter(entry => entry.nodeType === 'tool_exec' && entry.action?.name === 'plan_task' && entry.status === 'success').length;
  const reflectionEntries = executionLog.filter(entry => entry.nodeType === 'reflection');
  const postReflection = reflectionEntries.find(e => e.reflectionType === 'post');
  
  panel.innerHTML = `
    <div class="log-container">
      <div class="log-header">
        <div class="log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>执行日志</h3>
          ${planTaskCount > 0 ? `<span class="log-badge">任务拆解</span>` : ''}
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      
      <div class="log-summary">
        <div class="summary-item" title="总耗时: ${formatDuration(totalDuration)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${formatDuration(totalDuration)}</span>
        </div>
        <div class="summary-combo" title="总节点: ${executionLog.length}">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">总节点</span>
            <span class="combo-value">${executionLog.length}</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success" title="成功: ${successCount}">
              <span class="stat-icon">✓</span>
              <span class="stat-label">成功</span>
              <span class="stat-value">${successCount}</span>
            </div>
            <div class="combo-stat failed" data-status="failed" title="失败: ${failedCount}">
              <span class="stat-icon">✗</span>
              <span class="stat-label">失败</span>
              <span class="stat-value">${failedCount}</span>
            </div>
            ${subtaskCount > 0 ? `
            <div class="combo-stat subtask" data-status="subtask" title="子任务: ${completedSubtasks}/${subtaskCount}">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">子任务</span>
              <span class="stat-value">${completedSubtasks}/${subtaskCount}</span>
            </div>
            ` : ''}
            ${postReflection ? `
            <div class="combo-stat reflection" title="质量评估: ${postReflection.overallScore}/10">
              <span class="stat-icon">🎯</span>
              <span class="stat-label">评分</span>
              <span class="stat-value">${postReflection.overallScore}/10</span>
            </div>
            ` : ''}
          </div>
        </div>
        <div class="summary-actions">
          <button class="toggle-expand-btn" title="展开全部节点">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="timeline">
        ${renderExecutionLogForPanel(executionLog)}
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.remove();
    }
  });
  
  const logCloseBtn = panel.querySelector('.log-close');
  logCloseBtn.addEventListener('click', () => {
    panel.remove();
  });
  
  const toggleExpandBtn = panel.querySelector('.toggle-expand-btn');
  const timelineContents = panel.querySelectorAll('.timeline-content');
  let isExpanded = false;
  
  toggleExpandBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    timelineContents.forEach(content => {
      if (isExpanded) {
        content.classList.add('expanded');
      } else {
        content.classList.remove('expanded');
      }
    });
    
    const svg = toggleExpandBtn.querySelector('svg');
    if (isExpanded) {
      svg.innerHTML = '<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>';
      toggleExpandBtn.setAttribute('title', '收起全部节点');
    } else {
      svg.innerHTML = '<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>';
      toggleExpandBtn.setAttribute('title', '展开全部节点');
    }
  });
  
  const timelineHeaders = panel.querySelectorAll('.timeline-header');
  timelineHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const content = header.parentElement;
      content.classList.toggle('expanded');
    });
  });
  
  const filterableItems = panel.querySelectorAll('.combo-stat');
  const timelineItems = panel.querySelectorAll('.timeline-item');
  
  filterableItems.forEach(item => {
    item.addEventListener('click', () => {
      const status = item.dataset.status;
      const isActive = item.classList.contains('active');
      
      filterableItems.forEach(i => i.classList.remove('active'));
      
      if (!isActive) {
        item.classList.add('active');
        
        timelineItems.forEach(timelineItem => {
          if (status === 'subtask') {
            if (timelineItem.classList.contains('subtask-level')) {
              timelineItem.style.display = '';
            } else {
              timelineItem.style.display = 'none';
            }
          } else {
            const dot = timelineItem.querySelector('.timeline-dot');
            if (dot && dot.classList.contains(status)) {
              timelineItem.style.display = '';
            } else {
              timelineItem.style.display = 'none';
            }
          }
        });
      } else {
        timelineItems.forEach(timelineItem => {
          timelineItem.style.display = '';
        });
      }
    });
  });
}


// 导出面板渲染函数供 chat-manager.js 使用
export { showReflectionInfo, showExecutionLog };
