// execution-log-render.js - 执行日志渲染
// 从 chat-manager.js 提取

import state from './state.js';
import { escapeHtml, formatDuration } from './utils.js';
import logger from '../shared/logger.js';

// ============================================================
// 执行日志渲染
// ============================================================

function getStatusText(status) {
  const statusMap = {
    'success': '成功',
    'failed': '失败',
    'processing': '处理中'
  };
  return statusMap[status] || status;
}

export function renderExecutionTimeline(executionLog) {
  const sortedLog = [...executionLog].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const totalCount = sortedLog.length;
  
  let result = '';
  let currentSubtaskIndex = null;
  
  sortedLog.forEach((entry, index) => {
    const isSubtask = entry.nodeType === 'subtask';
    const isToolExec = entry.nodeType === 'tool_exec';
    const isApiCall = entry.nodeType === 'api_call';
    const isPreselect = entry.nodeType === 'preselect';
    const isReflection = entry.nodeType === 'reflection';
    const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
    
    if (isSubtask) {
      currentSubtaskIndex = entry.subtaskIndex;
    }
    
    let indentClass = '';
    let nodeIcon = '';
    
    if (isReflection) {
      nodeIcon = '🎯';
    } else if (isPreselect) {
      nodeIcon = '🔍';
    } else if (isPlanTask) {
      indentClass = 'plan-task-level';
      nodeIcon = '📋';
    } else if (isSubtask) {
      indentClass = 'subtask-level';
      nodeIcon = '🔀';
    } else if (isToolExec && currentSubtaskIndex !== null) {
      indentClass = 'tool-level';
      nodeIcon = '🔧';
    } else if (isApiCall && currentSubtaskIndex !== null) {
      indentClass = 'api-level';
      nodeIcon = '📡';
    } else if (isToolExec) {
      nodeIcon = '⚡';
    } else if (isApiCall) {
      nodeIcon = '📡';
    }
    
    let statusIcon = '○';
    let statusClass = entry.status || 'processing';
    if (entry.status === 'success') {
      statusIcon = '✓';
    } else if (entry.status === 'failed') {
      statusIcon = '✗';
    }
    if (isReflection) {
      statusClass = `reflection ${statusClass}`;
    }
    
    let nodeName = escapeHtml(entry.nodeName || '未知节点');
    
    if (entry.subtaskIndex !== null && entry.subtaskIndex >= 0) {
      nodeName = `<span class="subtask-badge">${entry.subtaskIndex + 1}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务, ${entry.strategy === 'sequential' ? '顺序执行' : '并行执行'})</span>`;
    }
    
    if ((isApiCall || isPreselect || isReflection) && entry.apiRequest) {
      const info = [];
      if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
        info.push(`💬<span title="本次模型API调用携带的消息数">${entry.apiRequest.messageCount}条</span>`);
      }
      if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
        info.push(`🔧<span title="本次模型API调用携带的工具定义数">${entry.apiRequest.toolCount}个</span>`);
      }
      if (info.length > 0) {
        nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
      }
    }
    
    result += `
      <div class="timeline-item ${indentClass}" data-status="${entry.status || 'processing'}" data-node-type="${entry.nodeType || ''}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${statusClass}">
          ${statusIcon}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${nodeIcon}</span>
            <span class="iteration-badge">[${index + 1}/${totalCount}]</span>
            <span class="node-name" title="${escapeHtml(entry.nodeName || '未知节点')}">${nodeName}</span>
            <span class="duration-badge" title="耗时">${formatDuration(entry.duration || 0)}</span>
          </div>
          
          <div class="timeline-details">
            ${entry.thought && entry.thought.trim() ? `
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${escapeHtml(entry.thought)}</div>
            </div>
            ` : ''}
            
            ${!isPreselect && entry.action ? `
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${escapeHtml(entry.action.name)}<br>
                <strong>参数:</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
              </div>
            </div>
            ` : ''}
            
            ${isPreselect && entry.action?.params?.selected ? `
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
                <strong>数量:</strong> ${entry.action.params.selected.length} 个
              </div>
            </div>
            ` : ''}
            
            ${entry.observation ? `
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${escapeHtml(entry.observation)}</div>
            </div>
            ` : ''}
            
            ${entry.apiRequest ? `
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${entry.apiRequest.model ? `<strong>模型:</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
                ${entry.apiRequest.temperature !== undefined ? `<strong>温度:</strong> ${entry.apiRequest.temperature}<br>` : ''}
                ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
                ${entry.apiRequest.messageCount !== undefined ? `<strong>消息数:</strong> ${entry.apiRequest.messageCount}<br>` : ''}
                ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>工具数:</strong> ${entry.apiRequest.toolCount}<br>` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.apiResponse ? `
            <div class="timeline-section">
              <div class="section-title">📤 API 响应</div>
              <div class="section-content">
                ${entry.apiResponse.finishReason ? `<strong>完成原因:</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
                ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>筛选后工具数:</strong> ${entry.apiResponse.toolCountAfter} 个<br>` : ''}
                ${entry.apiResponse.tokenUsage ? `
                  <strong>Token 使用:</strong><br>
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.error ? `
            <div class="timeline-section error">
              <div class="section-title">❌ 错误信息</div>
              <div class="section-content">${escapeHtml(entry.error)}</div>
            </div>
            ` : ''}
            
            ${entry.result ? `
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${escapeHtml(entry.result)}</div>
            </div>
            ` : ''}
            
            ${isReflection ? `
            <div class="timeline-section reflection-details">
              ${entry.prompt ? `
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${escapeHtml(entry.prompt)}</pre></div>
              </div>
              ` : ''}
              ${entry.rawContent ? `
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${escapeHtml(entry.rawContent)}</pre></div>
              </div>
              ` : ''}
              ${entry.apiResponse?.tokenUsage ? `
              <div class="timeline-section">
                <div class="section-title">📊 Token 使用</div>
                <div class="section-content">
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                </div>
              </div>
              ` : ''}
              ${entry.overallScore !== undefined && entry.overallScore !== null ? `
              <div class="section-title">⭐ 综合评分: ${entry.overallScore}/10</div>
              ` : ''}
              ${entry.dimensions && Object.keys(entry.dimensions).length > 0 ? `
              <div class="reflection-dimensions">
                ${Object.entries(entry.dimensions).map(([key, val]) => `
                  <div class="dimension-item">
                    <span class="dim-label">${key}</span>
                    <span class="dim-bar"><span class="dim-fill" style="width:${val * 10}%"></span></span>
                    <span class="dim-score">${val}/10</span>
                  </div>
                `).join('')}
              </div>
              ` : ''}
              ${entry.issues && entry.issues.length > 0 ? `
              <div class="section-title">📋 发现的问题</div>
              <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.suggestions && entry.suggestions.length > 0 ? `
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.action?.decision ? `
              <div class="section-title">🎯 决策: ${escapeHtml(entry.action.decision === 'passed' ? '✅ 通过' : entry.action.decision === 'revised' ? '🔧 已修订' : entry.action.decision === 'needs_improvement' ? '⚠️ 需改进' : entry.action.decision)}</div>
              ` : ''}
              ${entry.useful !== undefined ? `
              <div class="section-title">${entry.useful ? '✅ 结果有用' : '⚠️ 结果无效'}</div>
              ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
              ${entry.suggestion ? `<div class="section-content">建议: ${escapeHtml(entry.suggestion)}</div>` : ''}
              ` : ''}
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  return result;
}

export function renderExecutionLogForPanel(executionLog) {
  const sortedLog = [...executionLog].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // 检测是否有任务组信息
  const hasTaskGroups = sortedLog.some(entry => entry.taskGroup);
  
  if (!hasTaskGroups) {
    // 如果没有任务组信息，使用原来的渲染方式
    return renderExecutionLogOriginal(sortedLog);
  }
  
  // 按任务组分组
  const taskGroups = new Map();
  let currentTaskGroup = null;
  let mainTasks = [];
  
  sortedLog.forEach(entry => {
    if (entry.taskGroup) {
      if (!taskGroups.has(entry.taskGroup)) {
        taskGroups.set(entry.taskGroup, {
          groupId: entry.taskGroup,
          groupIndex: entry.taskGroupIndex,
          groupName: entry.taskGroupName,
          entries: [],
          status: entry.status
        });
      }
      taskGroups.get(entry.taskGroup).entries.push(entry);
      if (entry.status) {
        taskGroups.get(entry.taskGroup).status = entry.status;
      }
    } else {
      mainTasks.push(entry);
    }
  });
  
  // 渲染主任务日志（不在任何任务组中的日志）
  let result = renderMainTasks(mainTasks, sortedLog.length);
  
  // 渲染任务组
  taskGroups.forEach((group, groupId) => {
    const groupStatus = group.status || 'processing';
    const statusIcon = groupStatus === 'success' ? '✓' : (groupStatus === 'failed' ? '✗' : '○');
    const statusClass = groupStatus;
    
    result += `
      <div class="task-group-container" data-group-id="${groupId}">
        <div class="task-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="task-group-line"></div>
          <div class="task-group-dot ${statusClass}">
            ${statusIcon}
          </div>
          <div class="task-group-content">
            <div class="task-group-title">
              <span class="task-group-expand-icon">▼</span>
              <span class="task-group-icon">📁</span>
              <span class="task-group-index">${group.groupIndex}</span>
              <span class="task-group-name">${escapeHtml(group.groupName)}</span>
              <span class="task-group-count">(${group.entries.length} 步骤)</span>
            </div>
          </div>
        </div>
        <div class="task-group-timeline">
          ${renderTaskGroupEntries(group.entries, sortedLog.length)}
        </div>
      </div>
    `;
  });
  
  return result;
}

/**
 * 渲染主任务日志（不在任务组中的日志）
 */
function renderMainTasks(mainTasks, totalCount) {
  if (mainTasks.length === 0) return '';
  
  let result = '';
  
  result += `
    <div class="main-tasks-container">
      <div class="main-tasks-header">
        <div class="main-tasks-line"></div>
        <div class="main-tasks-dot processing">
          ◉
        </div>
        <div class="main-tasks-content">
          <div class="main-tasks-title">
            <span class="main-tasks-icon">🏠</span>
            <span class="main-tasks-name">主任务</span>
            <span class="main-tasks-count">(${mainTasks.length} 步骤)</span>
          </div>
        </div>
      </div>
      <div class="main-tasks-timeline">
  `;
  
  mainTasks.forEach((entry, index) => {
    result += renderSingleEntry(entry, index, totalCount);
  });
  
  result += `
      </div>
    </div>
  `;
  
  return result;
}

/**
 * 渲染任务组内的日志条目
 */
function renderTaskGroupEntries(entries, totalCount) {
  let result = '';
  entries.forEach((entry, index) => {
    result += renderSingleEntry(entry, index, totalCount);
  });
  return result;
}

/**
 * 渲染单个日志条目
 */
function renderSingleEntry(entry, index, totalCount) {
  const isSubtask = entry.nodeType === 'subtask';
  const isToolExec = entry.nodeType === 'tool_exec';
  const isApiCall = entry.nodeType === 'api_call';
  const isPreselect = entry.nodeType === 'preselect';
  const isReflection = entry.nodeType === 'reflection';
  const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
  
  let indentClass = '';
  let nodeIcon = '';
  
  if (isReflection) {
    indentClass = 'reflection-level';
    nodeIcon = '🎯';
  } else if (isPreselect) {
    nodeIcon = '📡';
  } else if (isPlanTask) {
    indentClass = 'plan-task-level';
    nodeIcon = '📋';
  } else if (isSubtask) {
    indentClass = 'subtask-level';
    nodeIcon = '🔀';
  } else if (isToolExec) {
    indentClass = 'tool-level';
    nodeIcon = '🔧';
  } else if (isApiCall) {
    indentClass = 'api-level';
    nodeIcon = '📡';
  } else if (isToolExec) {
    nodeIcon = '⚡';
  } else if (isApiCall) {
    nodeIcon = '📡';
  }
  
  let statusIcon = '○';
  let statusClass = entry.status || 'processing';
  if (entry.status === 'success') {
    statusIcon = '✓';
  } else if (entry.status === 'failed') {
    statusIcon = '✗';
  }
  if (isReflection) {
    statusClass = `reflection ${statusClass}`;
  }
  
  let nodeName = escapeHtml(entry.nodeName || '未知节点');
  
  if (entry.subtaskCount) {
    nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务, ${entry.strategy === 'sequential' ? '顺序执行' : '并行执行'})</span>`;
  }
  
  if ((isApiCall || isPreselect) && entry.apiRequest) {
    const info = [];
    if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
      info.push(`💬<span title="本次模型API调用携带的消息数">${entry.apiRequest.messageCount}条</span>`);
    }
    if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
      info.push(`🔧<span title="本次模型API调用携带的工具定义数">${entry.apiRequest.toolCount}个</span>`);
    }
    if (info.length > 0) {
      nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
    }
  }
  
  return `
    <div class="timeline-item ${indentClass}">
      <div class="timeline-line"></div>
      <div class="timeline-dot ${statusClass}">
        ${statusIcon}
      </div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="expand-icon">▼</span>
          <span class="node-icon">${nodeIcon}</span>
          <span class="iteration-badge">[${index + 1}/${totalCount}]</span>
          <span class="node-name" title="${escapeHtml(entry.nodeName || '未知节点')}">${nodeName}</span>
          <span class="duration-badge" title="耗时">${formatDuration(entry.duration)}</span>
        </div>
        
        <div class="timeline-details">
          ${entry.thought && entry.thought.trim() ? `
          <div class="timeline-section">
            <div class="section-title">💡 思考</div>
            <div class="section-content">${escapeHtml(entry.thought)}</div>
          </div>
          ` : ''}
          
          ${!isPreselect && entry.action ? `
          <div class="timeline-section">
            <div class="section-title">⚡ 工具调用</div>
            <div class="section-content">
              <strong>工具:</strong> ${escapeHtml(entry.action.name)}<br>
              <strong>参数:</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
            </div>
          </div>
          ` : ''}
          
          ${isPreselect && entry.action?.params?.selected ? `
          <div class="timeline-section">
            <div class="section-title">🔍 筛选结果</div>
            <div class="section-content">
              <strong>选中工具:</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
              <strong>数量:</strong> ${entry.action.params.selected.length} 个
            </div>
          </div>
          ` : ''}
          
          ${entry.observation && entry.observation !== entry.error ? `
          <div class="timeline-section">
            <div class="section-title">📝 观察结果</div>
            <div class="section-content">${escapeHtml(entry.observation)}</div>
          </div>
          ` : ''}
          
          ${entry.apiRequest ? `
          <div class="timeline-section">
            <div class="section-title">📡 API 请求</div>
            <div class="section-content">
              ${entry.apiRequest.model ? `<strong>模型:</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
              ${entry.apiRequest.temperature !== undefined ? `<strong>温度:</strong> ${entry.apiRequest.temperature}<br>` : ''}
              ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
              ${entry.apiRequest.messageCount !== undefined ? `<strong>消息数:</strong> ${entry.apiRequest.messageCount}<br>` : ''}
              ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>工具数:</strong> ${entry.apiRequest.toolCount}<br>` : ''}
            </div>
          </div>
          ` : ''}
          
          ${entry.apiResponse ? `
          <div class="timeline-section">
            <div class="section-title">📤 API 响应</div>
            <div class="section-content">
              ${entry.apiResponse.finishReason ? `<strong>完成原因:</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
              ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>筛选后工具数:</strong> ${entry.apiResponse.toolCountAfter} 个<br>` : ''}
              ${entry.apiResponse.tokenUsage ? `
                <strong>Token 使用:</strong><br>
                - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
              ` : ''}
            </div>
          </div>
          ` : ''}
          
          ${entry.error ? `
          <div class="timeline-section error">
            <div class="section-title">❌ 错误信息</div>
            <div class="section-content">${escapeHtml(entry.error)}</div>
          </div>
          ` : ''}
          
          ${entry.result ? `
          <div class="timeline-section">
            <div class="section-title">✅ 子任务结果</div>
            <div class="section-content">${escapeHtml(entry.result)}</div>
          </div>
          ` : ''}
          
          ${isReflection ? `
          <div class="timeline-section reflection-details">
            ${entry.overallScore !== undefined && entry.overallScore !== null ? `
            <div class="section-title">⭐ 综合评分: ${entry.overallScore}/10</div>
            ` : ''}
            ${entry.dimensions && Object.keys(entry.dimensions).length > 0 ? `
            <div class="reflection-dimensions">
              ${Object.entries(entry.dimensions).map(([key, val]) => `
                <div class="dimension-item">
                  <span class="dim-label">${key}</span>
                  <span class="dim-bar"><span class="dim-fill" style="width:${val * 10}%"></span></span>
                  <span class="dim-score">${val}/10</span>
                </div>
              `).join('')}
            </div>
            ` : ''}
            ${entry.issues && entry.issues.length > 0 ? `
            <div class="section-title">📋 发现的问题</div>
            <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
            ` : ''}
            ${entry.suggestions && entry.suggestions.length > 0 ? `
            <div class="section-title">💡 改进建议</div>
            <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
            ` : ''}
            ${entry.action?.decision ? `
            <div class="section-title">🎯 决策: ${escapeHtml(entry.action.decision === 'passed' ? '✅ 通过' : entry.action.decision === 'revised' ? '🔧 已修订' : entry.action.decision === 'needs_improvement' ? '⚠️ 需改进' : entry.action.decision)}</div>
            ` : ''}
            ${entry.useful !== undefined ? `
            <div class="section-title">${entry.useful ? '✅ 结果有用' : '⚠️ 结果无效'}</div>
            ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
            ${entry.suggestion ? `<div class="section-content">建议: ${escapeHtml(entry.suggestion)}</div>` : ''}
            ` : ''}
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * 原来的日志渲染方式（保留用于没有任务组的场景）
 */
function renderExecutionLogOriginal(sortedLog) {
  let result = '';
  let currentSubtaskIndex = null;
  
  sortedLog.forEach((entry, index) => {
    const isSubtask = entry.nodeType === 'subtask';
    const isToolExec = entry.nodeType === 'tool_exec';
    const isApiCall = entry.nodeType === 'api_call';
    const isPreselect = entry.nodeType === 'preselect';
    const isReflection = entry.nodeType === 'reflection';
    const isPlanTask = isToolExec && entry.action?.name === 'plan_task';
    
    if (isSubtask) {
      currentSubtaskIndex = entry.subtaskIndex;
    }
    
    let indentClass = '';
    let nodeIcon = '';
    
    if (isReflection) {
      nodeIcon = '🎯';
    } else if (isPreselect) {
      nodeIcon = '🔍';
    } else if (isPlanTask) {
      indentClass = 'plan-task-level';
      nodeIcon = '📋';
    } else if (isSubtask) {
      indentClass = 'subtask-level';
      nodeIcon = '🔀';
    } else if (isToolExec && currentSubtaskIndex !== null) {
      indentClass = 'tool-level';
      nodeIcon = '🔧';
    } else if (isApiCall && currentSubtaskIndex !== null) {
      indentClass = 'api-level';
      nodeIcon = '📡';
    } else if (isToolExec) {
      nodeIcon = '⚡';
    } else if (isApiCall) {
      nodeIcon = '📡';
    }
    
    let statusIcon = '○';
    let statusClass = entry.status || 'processing';
    if (entry.status === 'success') {
      statusIcon = '✓';
    } else if (entry.status === 'failed') {
      statusIcon = '✗';
    }
    
    let nodeName = escapeHtml(entry.nodeName || '未知节点');
    
    if (entry.subtaskId) {
      nodeName = `<span class="subtask-badge">${currentSubtaskIndex !== null ? currentSubtaskIndex + 1 : ''}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${entry.subtaskCount}个子任务, ${entry.strategy === 'sequential' ? '顺序执行' : '并行执行'})</span>`;
    }
    
    if ((isApiCall || isPreselect || isReflection) && entry.apiRequest) {
      const info = [];
      if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
        info.push(`💬<span title="本次模型API调用携带的消息数">${entry.apiRequest.messageCount}条</span>`);
      }
      if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
        info.push(`🔧<span title="本次模型API调用携带的工具定义数">${entry.apiRequest.toolCount}个</span>`);
      }
      if (info.length > 0) {
        nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
      }
    }
    
    result += `
      <div class="timeline-item ${indentClass}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${statusClass}">
          ${statusIcon}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${nodeIcon}</span>
            <span class="iteration-badge">[${index + 1}/${sortedLog.length}]</span>
            <span class="node-name" title="${escapeHtml(entry.nodeName || '未知节点')}">${nodeName}</span>
            <span class="duration-badge" title="耗时">${formatDuration(entry.duration)}</span>
          </div>
          
          <div class="timeline-details">
            ${entry.thought && entry.thought.trim() ? `
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${escapeHtml(entry.thought)}</div>
            </div>
            ` : ''}
            
            ${!isPreselect && entry.action ? `
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${escapeHtml(entry.action.name)}<br>
                <strong>参数:</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
              </div>
            </div>
            ` : ''}
            
            ${isPreselect && entry.action?.params?.selected ? `
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
                <strong>数量:</strong> ${entry.action.params.selected.length} 个
              </div>
            </div>
            ` : ''}
            
            ${entry.observation ? `
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${escapeHtml(entry.observation)}</div>
            </div>
            ` : ''}
            
            ${entry.apiRequest ? `
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${entry.apiRequest.model ? `<strong>模型:</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
                ${entry.apiRequest.temperature !== undefined ? `<strong>温度:</strong> ${entry.apiRequest.temperature}<br>` : ''}
                ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
                ${entry.apiRequest.messageCount !== undefined ? `<strong>消息数:</strong> ${entry.apiRequest.messageCount}<br>` : ''}
                ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>工具数:</strong> ${entry.apiRequest.toolCount}<br>` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.apiResponse ? `
            <div class="timeline-section">
              <div class="section-title">📤 API 响应</div>
              <div class="section-content">
                ${entry.apiResponse.finishReason ? `<strong>完成原因:</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
                ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>筛选后工具数:</strong> ${entry.apiResponse.toolCountAfter} 个<br>` : ''}
                ${entry.apiResponse.tokenUsage ? `
                  <strong>Token 使用:</strong><br>
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.error ? `
            <div class="timeline-section error">
              <div class="section-title">❌ 错误信息</div>
              <div class="section-content">${escapeHtml(entry.error)}</div>
            </div>
            ` : ''}
            
            ${entry.result ? `
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${escapeHtml(entry.result)}</div>
            </div>
            ` : ''}
            
            ${isReflection ? `
            <div class="timeline-section reflection-details">
              ${entry.prompt ? `
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${escapeHtml(entry.prompt)}</pre></div>
              </div>
              ` : ''}
              ${entry.rawContent ? `
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${escapeHtml(entry.rawContent)}</pre></div>
              </div>
              ` : ''}
              ${entry.apiResponse?.tokenUsage ? `
              <div class="timeline-section">
                <div class="section-title">📊 Token 使用</div>
                <div class="section-content">
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || 0}
                </div>
              </div>
              ` : ''}
              ${entry.overallScore !== undefined && entry.overallScore !== null ? `
              <div class="section-title">⭐ 综合评分: ${entry.overallScore}/10</div>
              ` : ''}
              ${entry.dimensions && Object.keys(entry.dimensions).length > 0 ? `
              <div class="reflection-dimensions">
                ${Object.entries(entry.dimensions).map(([key, val]) => `
                  <div class="dimension-item">
                    <span class="dim-label">${key}</span>
                    <span class="dim-bar"><span class="dim-fill" style="width:${val * 10}%"></span></span>
                    <span class="dim-score">${val}/10</span>
                  </div>
                `).join('')}
              </div>
              ` : ''}
              ${entry.issues && entry.issues.length > 0 ? `
              <div class="section-title">📋 发现的问题</div>
              <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.suggestions && entry.suggestions.length > 0 ? `
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.action?.decision ? `
              <div class="section-title">🎯 决策: ${escapeHtml(entry.action.decision === 'passed' ? '✅ 通过' : entry.action.decision === 'revised' ? '🔧 已修订' : entry.action.decision === 'needs_improvement' ? '⚠️ 需改进' : entry.action.decision)}</div>
              ` : ''}
              ${entry.useful !== undefined ? `
              <div class="section-title">${entry.useful ? '✅ 结果有用' : '⚠️ 结果无效'}</div>
              ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
              ${entry.suggestion ? `<div class="section-content">建议: ${escapeHtml(entry.suggestion)}</div>` : ''}
              ` : ''}
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  return result;
}

export function updateRealtimeExecutionLogPanel(status) {
  const panel = document.querySelector('.execution-log-panel.realtime-mode');
  if (!panel) return;
  
  // 更新"执行中"节点名称
  const executingNode = panel.querySelector('.realtime-executing-node');
  if (executingNode) {
    executingNode.textContent = status.nodeName || '处理中...';
  }
  
  const executionLog = status.executionLog || [];
  const totalCount = executionLog.length;
  const successCount = executionLog.filter(entry => entry.status === 'success').length;
  const failedCount = executionLog.filter(entry => entry.status === 'failed').length;
  const subtaskCount = executionLog.filter(entry => entry.nodeType === 'subtask').length;
  const completedSubtasks = executionLog.filter(entry => entry.nodeType === 'subtask' && entry.status === 'success').length;
  
  // 更新统计数字
  const comboValue = panel.querySelector('.combo-value');
  const statSuccess = panel.querySelector('.combo-stat.success .stat-value');
  const statFailed = panel.querySelector('.combo-stat.failed .stat-value');
  const statSubtask = panel.querySelector('.combo-stat.subtask');
  
  if (comboValue) comboValue.textContent = totalCount;
  if (statSuccess) statSuccess.textContent = successCount;
  if (statFailed) statFailed.textContent = failedCount;
  if (statSubtask) {
    if (subtaskCount > 0) {
      statSubtask.style.display = '';
      statSubtask.querySelector('.stat-value').textContent = `${completedSubtasks}/${subtaskCount}`;
    } else {
      statSubtask.style.display = 'none';
    }
  }
  
  // 更新 timeline
  const timeline = panel.querySelector('.timeline');
  timeline.innerHTML = executionLog.length > 0
    ? renderExecutionTimeline(executionLog)
    : '<div class="realtime-waiting-message">等待执行中...</div>';
  
  // 自动滚动到底部
  timeline.scrollTop = timeline.scrollHeight;
}

export function showRealtimeExecutionLogPanel(loadingId) {
  const existingPanel = document.querySelector('.execution-log-panel.realtime-mode');
  if (existingPanel) {
    existingPanel.remove();
  }
  
  const panel = document.createElement('div');
  panel.className = 'execution-log-panel realtime-mode';
  
  panel.innerHTML = `
    <div class="log-container">
      <div class="log-header">
        <div class="log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>实时执行日志</h3>
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      
      <div class="log-summary">
        <div class="realtime-executing-indicator">
          <span class="realtime-pulse-dot"></span>
          <span class="realtime-executing-label">执行中:</span>
          <span class="realtime-executing-node">准备中...</span>
        </div>
        <div class="summary-combo">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">总节点</span>
            <span class="combo-value">0</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success">
              <span class="stat-icon">✓</span>
              <span class="stat-label">成功</span>
              <span class="stat-value">0</span>
            </div>
            <div class="combo-stat failed" data-status="failed">
              <span class="stat-icon">✗</span>
              <span class="stat-label">失败</span>
              <span class="stat-value">0</span>
            </div>
            <div class="combo-stat subtask" data-status="subtask" style="display:none">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">子任务</span>
              <span class="stat-value">0/0</span>
            </div>
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
        <div class="realtime-waiting-message">等待执行中...</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // 关闭按钮
  const closeBtn = panel.querySelector('.log-close');
  closeBtn.addEventListener('click', () => {
    panel.remove();
  });
  
  // 点击遮罩关闭
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.remove();
    }
  });
  
  // 展开/收起全部
  const toggleExpandBtn = panel.querySelector('.toggle-expand-btn');
  let isExpanded = false;
  toggleExpandBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    const timelineContents = panel.querySelectorAll('.timeline-content');
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
  
  // 单条展开/收起（事件委托）
  panel.addEventListener('click', (e) => {
    const header = e.target.closest('.timeline-header');
    if (header) {
      // Ctrl/Meta + Click 用于复制，不触发展开/折叠
      if (e.ctrlKey || e.metaKey) return;
      const content = header.parentElement;
      content.classList.toggle('expanded');
    }
  });
  
  // 按状态筛选
  panel.addEventListener('click', (e) => {
    const target = e.target.closest('.combo-stat[data-status]');
    if (!target) return;
    
    const status = target.dataset.status;
    const isActive = target.classList.contains('active');
    
    panel.querySelectorAll('.combo-stat[data-status]').forEach(item => {
      item.classList.remove('active');
    });
    
    const timelineItems = panel.querySelectorAll('.timeline-item');
    
    if (!isActive) {
      target.classList.add('active');
      
      timelineItems.forEach(timelineItem => {
        if (status === 'subtask') {
          const nodeType = timelineItem.dataset.nodeType;
          if (nodeType === 'subtask') {
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
  
  if (state.currentExecutionStatus) {
    updateRealtimeExecutionLogPanel(state.currentExecutionStatus);
  }
}

export function toggleRealtimeExecutionLog(loadingId) {
  const existingPanel = document.querySelector('.execution-log-panel.realtime-mode');
  if (existingPanel) {
    existingPanel.remove();
    return;
  }
  
  showRealtimeExecutionLogPanel(loadingId);
}

export function updateExecutionStatus(loadingId, nodeName, status, executionLog) {
  const loadingDiv = document.getElementById(loadingId);
  if (!loadingDiv) return;
  
  logger.debug('[SidePanel] updateExecutionStatus 被调用:', nodeName, status, '日志数量:', executionLog?.length);
  
  const nodeNameSpan = loadingDiv.querySelector('.current-node-name');
  if (nodeNameSpan) {
    nodeNameSpan.textContent = nodeName || '处理中...';
    nodeNameSpan.title = nodeName || '';
  }
  
  if (!state.currentExecutionStatus) {
    state.currentExecutionStatus = {
      nodeName: nodeName,
      status: status,
      executionLog: []
    };
  } else {
    if (!state.currentExecutionStatus.executionLog) {
      state.currentExecutionStatus.executionLog = [];
    }
    
    if (executionLog && executionLog.length > 0) {
      executionLog.forEach(newEntry => {
        const existingIndex = state.currentExecutionStatus.executionLog.findIndex(
          existing => existing.id === newEntry.id
        );
        if (existingIndex !== -1) {
          const existingEntry = state.currentExecutionStatus.executionLog[existingIndex];
          state.currentExecutionStatus.executionLog[existingIndex] = {
            ...newEntry,
            subtaskIndex: newEntry.subtaskIndex ?? existingEntry.subtaskIndex,
            subtaskId: newEntry.subtaskId ?? existingEntry.subtaskId,
            subtaskName: newEntry.subtaskName ?? existingEntry.subtaskName
          };
        } else {
          state.currentExecutionStatus.executionLog.push(newEntry);
        }
      });
    }
    
    state.currentExecutionStatus.nodeName = nodeName;
    state.currentExecutionStatus.status = status;
  }
  
  const realtimePanel = document.querySelector('.execution-log-panel.realtime-mode');
  if (realtimePanel) {
    updateRealtimeExecutionLogPanel(state.currentExecutionStatus);
  }
}