// side_panel/chat-panels.js - 聊天面板渲染函数
// 从 chat-manager.js 拆分，包含执行日志面板与反思信息面板的渲染逻辑

import { escapeHtml, formatDuration } from './utils.js';
import { renderExecutionLogForPanel } from './execution-log-render.js';
import { t, registerTranslations } from '../shared/i18n.js';

// 注册 chatPanels 命名空间翻译
registerTranslations('zh', {
  chatPanels: {
    decisionPassed: '通过',
    decisionRevised: '已修订',
    decisionNeedsImprovement: '需改进',
    dimAccuracy: '准确性',
    dimCompleteness: '完整性',
    dimRelevance: '相关性',
    dimClarity: '清晰度',
    dimUsefulness: '实用性',
    dimSafety: '安全性',
    dimEfficiency: '效率',
    dimensionsTitle: '📊 评分维度',
    issuesTitle: '❗ 发现的问题',
    suggestionsTitle: '💡 改进建议',
    roundsEvaluated: '评估 {rounds} 轮{revised}',
    revisedTag: '（已修订）',
    finalDecision: '最终决策：{label}',
    resultUseful: '结果可用',
    resultNeedsImprovement: '结果需改进',
    processTitle: '🔄 评估过程',
    scoreHighExplanation: '回答质量较高，内容准确、完整且清晰。',
    scoreMidExplanation: '回答基本可用，但存在一些可以改进的地方。',
    scoreLowExplanation: '回答质量较低，存在明显问题需要改进。',
    reflectionTitle: '💡 质量评估详情',
    overallScore: '综合评分',
    scoreExplanationTitle: '📝 评分说明',
    aboutTitle: 'ℹ️ 关于质量评估',
    aboutDesc: '质量评估由 AI 自动完成，从多个维度对回答进行打分，帮助判断回答的可靠程度。',
    scoreStandard: '评分标准：8-10 分优秀，5-7 分良好，1-4 分需改进。',
    executionLogTitle: '执行日志',
    taskBreakdown: '任务拆解',
    totalDurationTitle: '总耗时：{duration}',
    totalDuration: '总耗时',
    totalNodesTitle: '共 {count} 个执行节点',
    totalNodes: '执行节点',
    successCountTitle: '成功 {count} 个',
    successLabel: '成功',
    failedCountTitle: '失败 {count} 个',
    failedLabel: '失败',
    subtaskCountTitle: '子任务 {completed}/{total} 完成',
    subtaskLabel: '子任务',
    scoreTitle: '评分 {score}/10',
    scoreLabel: '评分',
    expandAll: '展开全部',
    collapseAll: '收起全部',
  },
});

registerTranslations('en', {
  chatPanels: {
    decisionPassed: 'Passed',
    decisionRevised: 'Revised',
    decisionNeedsImprovement: 'Needs Improvement',
    dimAccuracy: 'Accuracy',
    dimCompleteness: 'Completeness',
    dimRelevance: 'Relevance',
    dimClarity: 'Clarity',
    dimUsefulness: 'Usefulness',
    dimSafety: 'Safety',
    dimEfficiency: 'Efficiency',
    dimensionsTitle: '📊 Scoring Dimensions',
    issuesTitle: '❗ Issues Found',
    suggestionsTitle: '💡 Suggestions',
    roundsEvaluated: 'Evaluated {rounds} rounds{revised}',
    revisedTag: ' (revised)',
    finalDecision: 'Final Decision: {label}',
    resultUseful: 'Result is useful',
    resultNeedsImprovement: 'Result needs improvement',
    processTitle: '🔄 Evaluation Process',
    scoreHighExplanation: 'The answer is high quality, accurate, complete, and clear.',
    scoreMidExplanation: 'The answer is generally usable but has room for improvement.',
    scoreLowExplanation: 'The answer is low quality with obvious issues that need improvement.',
    reflectionTitle: '💡 Quality Assessment Details',
    overallScore: 'Overall Score',
    scoreExplanationTitle: '📝 Score Explanation',
    aboutTitle: 'ℹ️ About Quality Assessment',
    aboutDesc: 'Quality assessment is performed automatically by AI, scoring answers across multiple dimensions to help judge reliability.',
    scoreStandard: 'Scoring: 8-10 excellent, 5-7 good, 1-4 needs improvement.',
    executionLogTitle: 'Execution Log',
    taskBreakdown: 'Task Breakdown',
    totalDurationTitle: 'Total duration: {duration}',
    totalDuration: 'Duration',
    totalNodesTitle: '{count} execution nodes',
    totalNodes: 'Nodes',
    successCountTitle: '{count} succeeded',
    successLabel: 'Success',
    failedCountTitle: '{count} failed',
    failedLabel: 'Failed',
    subtaskCountTitle: 'Subtasks {completed}/{total} done',
    subtaskLabel: 'Subtasks',
    scoreTitle: 'Score {score}/10',
    scoreLabel: 'Score',
    expandAll: 'Expand All',
    collapseAll: 'Collapse All',
  },
});

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
  const decisionLabel = decision === 'passed' ? t('chatPanels.decisionPassed') : (decision === 'revised' ? t('chatPanels.decisionRevised') : (decision === 'needs_improvement' ? t('chatPanels.decisionNeedsImprovement') : ''));

  const dimLabels = {
    accuracy: t('chatPanels.dimAccuracy'),
    completeness: t('chatPanels.dimCompleteness'),
    relevance: t('chatPanels.dimRelevance'),
    clarity: t('chatPanels.dimClarity'),
    usefulness: t('chatPanels.dimUsefulness'),
    safety: t('chatPanels.dimSafety'),
    efficiency: t('chatPanels.dimEfficiency')
  };

  let dimensionsHtml = '';
  if (dimensions && Object.keys(dimensions).length > 0) {
    dimensionsHtml = `
      <div class="ri-section">
        <div class="ri-section-title">${t('chatPanels.dimensionsTitle')}</div>
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
        <div class="ri-section-title">${t('chatPanels.issuesTitle')}</div>
        <ul class="ri-list">${issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
      </div>
    `;
  }

  let suggestionsHtml = '';
  if (suggestions && suggestions.length > 0) {
    suggestionsHtml = `
      <div class="ri-section">
        <div class="ri-section-title">${t('chatPanels.suggestionsTitle')}</div>
        <ul class="ri-list">${suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </div>
    `;
  }

  let processHtml = '';
  if (rounds > 0 || decision || useful !== null) {
    const processItems = [];
    if (rounds > 0) processItems.push(`<span class="ri-tag">${t('chatPanels.roundsEvaluated', { rounds, revised: wasRevised ? t('chatPanels.revisedTag') : '' })}</span>`);
    if (decision) processItems.push(`<span class="ri-tag">${t('chatPanels.finalDecision', { label: decisionLabel })}</span>`);
    if (useful !== null) processItems.push(`<span class="ri-tag">${useful ? t('chatPanels.resultUseful') : t('chatPanels.resultNeedsImprovement')}</span>`);
    if (reasoning) processItems.push(`<div class="ri-reasoning">📝 ${escapeHtml(reasoning)}</div>`);

    processHtml = `
      <div class="ri-section">
        <div class="ri-section-title">${t('chatPanels.processTitle')}</div>
        <div class="ri-process">${processItems.join('')}</div>
      </div>
    `;
  }

  // 评分说明
  const scoreExplanation = overallScore >= 8
    ? t('chatPanels.scoreHighExplanation')
    : (overallScore >= 5
      ? t('chatPanels.scoreMidExplanation')
      : t('chatPanels.scoreLowExplanation'));

  overlay.innerHTML = `
    <div class="reflection-info-panel">
      <div class="ri-header">
        <div class="ri-title">${t('chatPanels.reflectionTitle')}</div>
        <button class="ri-close" title="${t('common.close')}">✕</button>
      </div>
      <div class="ri-body">
        <div class="ri-score-overview">
          <span class="ri-score-emoji">${scoreEmoji}</span>
          <span class="ri-score-value ${scoreColor}">${overallScore}<span class="ri-score-max">/10</span></span>
          <span class="ri-score-label">${t('chatPanels.overallScore')}</span>
        </div>
        <div class="ri-section">
          <div class="ri-section-title">${t('chatPanels.scoreExplanationTitle')}</div>
          <p class="ri-text">${scoreExplanation}</p>
        </div>
        ${dimensionsHtml}
        ${issuesHtml}
        ${suggestionsHtml}
        ${processHtml}
        <div class="ri-section ri-about">
          <div class="ri-section-title">${t('chatPanels.aboutTitle')}</div>
          <p class="ri-text">${t('chatPanels.aboutDesc')}</p>
          <p class="ri-text ri-text-sm">${t('chatPanels.scoreStandard')}</p>
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
          <h3>${t('chatPanels.executionLogTitle')}</h3>
          ${planTaskCount > 0 ? `<span class="log-badge">${t('chatPanels.taskBreakdown')}</span>` : ''}
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>

      <div class="log-summary">
        <div class="summary-item" title="${t('chatPanels.totalDurationTitle', { duration: formatDuration(totalDuration) })}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">${t('chatPanels.totalDuration')}</span>
          <span class="summary-value">${formatDuration(totalDuration)}</span>
        </div>
        <div class="summary-combo" title="${t('chatPanels.totalNodesTitle', { count: executionLog.length })}">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">${t('chatPanels.totalNodes')}</span>
            <span class="combo-value">${executionLog.length}</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success" title="${t('chatPanels.successCountTitle', { count: successCount })}">
              <span class="stat-icon">✓</span>
              <span class="stat-label">${t('chatPanels.successLabel')}</span>
              <span class="stat-value">${successCount}</span>
            </div>
            <div class="combo-stat failed" data-status="failed" title="${t('chatPanels.failedCountTitle', { count: failedCount })}">
              <span class="stat-icon">✗</span>
              <span class="stat-label">${t('chatPanels.failedLabel')}</span>
              <span class="stat-value">${failedCount}</span>
            </div>
            ${subtaskCount > 0 ? `
            <div class="combo-stat subtask" data-status="subtask" title="${t('chatPanels.subtaskCountTitle', { completed: completedSubtasks, total: subtaskCount })}">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">${t('chatPanels.subtaskLabel')}</span>
              <span class="stat-value">${completedSubtasks}/${subtaskCount}</span>
            </div>
            ` : ''}
            ${postReflection ? `
            <div class="combo-stat reflection" title="${t('chatPanels.scoreTitle', { score: postReflection.overallScore })}">
              <span class="stat-icon">🎯</span>
              <span class="stat-label">${t('chatPanels.scoreLabel')}</span>
              <span class="stat-value">${postReflection.overallScore}/10</span>
            </div>
            ` : ''}
          </div>
        </div>
        <div class="summary-actions">
          <button class="toggle-expand-btn" title="${t('chatPanels.expandAll')}">
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
      toggleExpandBtn.setAttribute('title', t('chatPanels.collapseAll'));
    } else {
      svg.innerHTML = '<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>';
      toggleExpandBtn.setAttribute('title', t('chatPanels.expandAll'));
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
