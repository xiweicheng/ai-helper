// execution-log-render.js - 执行日志渲染
// 从 chat-manager.js 提取

import state from './state.js';
import { escapeHtml, escapeAttr, formatDuration } from './utils.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

// ============================================================
// 执行日志渲染
// ============================================================

registerTranslations('zh', {
  execLog: {
    statusSuccess: '成功',
    statusFailed: '失败',
    statusProcessing: '处理中',
    unknownNode: '未知节点',
    sequentialExecution: '顺序执行',
    parallelExecution: '并行执行',
    subtaskCountStrategy: '{count}个子任务, {strategy}',
    messageCountTitle: '本次模型API调用携带的消息数',
    toolCountTitle: '本次模型API调用携带的工具定义数',
    messageCount: '{count}条',
    toolCount: '{count}个',
    durationTitle: '耗时',
    sectionThought: '💡 思考',
    sectionToolCall: '⚡ 工具调用',
    labelTool: '工具:',
    labelParams: '参数:',
    sectionFilterResult: '🔍 筛选结果',
    labelSelectedTools: '选中工具:',
    labelCount: '数量:',
    unitItems: '个',
    sectionObservation: '📝 观察结果',
    sectionApiRequest: '📡 API 请求',
    labelModel: '模型:',
    labelTemperature: '温度:',
    labelTopP: 'top_p:',
    labelMessageCount: '消息数:',
    labelToolCount: '工具数:',
    sectionApiResponse: '📤 API 响应',
    labelFinishReason: '完成原因:',
    labelFilteredToolCount: '筛选后工具数:',
    labelTokenUsage: 'Token 使用:',
    sectionError: '❌ 错误信息',
    sectionSubtaskResult: '✅ 子任务结果',
    sectionReflectionPrompt: '📊 评估提示词',
    sectionReflectionRaw: '📤 评估结果（原始响应）',
    sectionTokenUsage: '📊 Token 使用',
    overallScore: '⭐ 综合评分: {score}/10',
    sectionIssues: '📋 发现的问题',
    sectionSuggestions: '💡 改进建议',
    labelDecision: '🎯 决策: {decision}',
    decisionPassed: '✅ 通过',
    decisionRevised: '🔧 已修订',
    decisionNeedsImprovement: '⚠️ 需改进',
    resultUseful: '✅ 结果有用',
    resultInvalid: '⚠️ 结果无效',
    labelSuggestion: '建议: {suggestion}',
    mainTask: '主任务',
    stepCount: '({count} 步骤)',
    processingDots: '处理中...',
    waitingExecution: '等待执行中...',
    realtimeLogTitle: '实时执行日志',
    executingLabel: '执行中:',
    preparing: '准备中...',
    totalNodes: '总节点',
    labelSuccess: '成功',
    labelFailed: '失败',
    labelSubtask: '子任务',
    expandAll: '展开全部节点',
    collapseAll: '收起全部节点',
  },
});

registerTranslations('en', {
  execLog: {
    statusSuccess: 'Success',
    statusFailed: 'Failed',
    statusProcessing: 'Processing',
    unknownNode: 'Unknown node',
    sequentialExecution: 'sequential',
    parallelExecution: 'parallel',
    subtaskCountStrategy: '{count} subtasks, {strategy}',
    messageCountTitle: 'Number of messages carried in this model API call',
    toolCountTitle: 'Number of tool definitions carried in this model API call',
    messageCount: '{count} msgs',
    toolCount: '{count} tools',
    durationTitle: 'Duration',
    sectionThought: '💡 Thought',
    sectionToolCall: '⚡ Tool Call',
    labelTool: 'Tool:',
    labelParams: 'Params:',
    sectionFilterResult: '🔍 Filter Result',
    labelSelectedTools: 'Selected tools:',
    labelCount: 'Count:',
    unitItems: '',
    sectionObservation: '📝 Observation',
    sectionApiRequest: '📡 API Request',
    labelModel: 'Model:',
    labelTemperature: 'Temperature:',
    labelTopP: 'top_p:',
    labelMessageCount: 'Messages:',
    labelToolCount: 'Tools:',
    sectionApiResponse: '📤 API Response',
    labelFinishReason: 'Finish reason:',
    labelFilteredToolCount: 'Filtered tool count:',
    labelTokenUsage: 'Token Usage:',
    sectionError: '❌ Error',
    sectionSubtaskResult: '✅ Subtask Result',
    sectionReflectionPrompt: '📊 Reflection Prompt',
    sectionReflectionRaw: '📤 Reflection Result (raw)',
    sectionTokenUsage: '📊 Token Usage',
    overallScore: '⭐ Overall Score: {score}/10',
    sectionIssues: '📋 Issues Found',
    sectionSuggestions: '💡 Suggestions',
    labelDecision: '🎯 Decision: {decision}',
    decisionPassed: '✅ Passed',
    decisionRevised: '🔧 Revised',
    decisionNeedsImprovement: '⚠️ Needs Improvement',
    resultUseful: '✅ Useful',
    resultInvalid: '⚠️ Invalid',
    labelSuggestion: 'Suggestion: {suggestion}',
    mainTask: 'Main Task',
    stepCount: '({count} steps)',
    processingDots: 'Processing...',
    waitingExecution: 'Waiting for execution...',
    realtimeLogTitle: 'Real-time Execution Log',
    executingLabel: 'Executing:',
    preparing: 'Preparing...',
    totalNodes: 'Total nodes',
    labelSuccess: 'Success',
    labelFailed: 'Failed',
    labelSubtask: 'Subtask',
    expandAll: 'Expand all nodes',
    collapseAll: 'Collapse all nodes',
  },
});

function getStatusText(status) {
  const statusMap = {
    'success': t('execLog.statusSuccess'),
    'failed': t('execLog.statusFailed'),
    'processing': t('execLog.statusProcessing')
  };
  return statusMap[status] || status;
}

// 提取工具调用的参数预览（如 execute_command 的命令、agent_file 的路径等），用于节点 header 展示
export function getToolCallPreview(entry) {
  if (entry?.nodeType !== 'tool_exec' || !entry?.action) return '';
  const toolName = entry.action.name || '';
  let p = entry.action.params;
  if (p == null) return '';
  if (typeof p === 'string') {
    p = (() => { try { return JSON.parse(p); } catch { return { raw: p }; } })();
  }
  if (typeof p !== 'object') return String(p).trim();

  // 命令执行类：显示具体命令
  if (toolName === 'execute_command' || toolName === 'agent_exec') {
    return (p.command || p.cmd || '').toString().trim();
  }
  // 文件操作类：显示路径（提取不到时回退到通用兜底）
  if (toolName === 'agent_file' || toolName === 'file_upload' || toolName === 'download_file') {
    const filePreview = (p.file_path || p.filePath || p.path || p.filename || p.fileName || p.url || '').toString().trim();
    if (filePreview) return filePreview;
  }
  // 网页类：显示 URL 或 selector（如 manage_tab 的 action/tabId 等参数回退到通用兜底）
  if (toolName === 'fetch_url' || toolName === 'interact_element' || toolName === 'fill_form' || toolName === 'manage_tab' || toolName === 'preview_ui') {
    const webPreview = (p.url || p.href || p.selector || '').toString().trim();
    if (webPreview) return webPreview;
  }
  // 搜索类：显示 query
  if (toolName === 'search_browser_data' || toolName === 'search_in_page' || toolName === 'exec_log') {
    const searchPreview = (p.query || p.keyword || p.text || '').toString().trim();
    if (searchPreview) return searchPreview;
  }
  // 子 Agent 分派：显示 task 预览
  if (toolName === 'dispatch_task') {
    const taskPreview = (p.task || '').toString().trim();
    if (taskPreview) return taskPreview;
  }
  // 记忆类：显示 action
  if (toolName === 'agent_memory') {
    const memoryPreview = (p.action || p.subAction || '').toString().trim();
    if (memoryPreview) return memoryPreview;
  }
  // 通用兜底：取关键参数键值对（排除大内容字段，避免 header 拼接长文本）
  const LARGE_PARAM_KEYS = ['content', 'text', 'prompt', 'description', 'markdown', 'html', 'css', 'js', 'code', 'script', 'data'];
  const keys = Object.keys(p).filter(k => p[k] != null && p[k] !== '' && !LARGE_PARAM_KEYS.includes(k));
  if (keys.length === 0) return '';
  if (keys.length === 1) {
    const val = String(p[keys[0]]);
    return `${keys[0]}: ${val}`;
  }
  // 多参数：取前 2 个关键参数
  return keys.slice(0, 2).map(k => `${k}=${JSON.stringify(p[k])}`).join(', ');
}

// 向后兼容旧名称
function getToolCommandPreview(entry) {
  return getToolCallPreview(entry);
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
    
    let nodeName = escapeHtml(entry.nodeName || t('execLog.unknownNode'));
    
    if (entry.subtaskIndex !== null && entry.subtaskIndex >= 0) {
      nodeName = `<span class="subtask-badge">${entry.subtaskIndex + 1}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${t('execLog.subtaskCountStrategy', { count: entry.subtaskCount, strategy: entry.strategy === 'sequential' ? t('execLog.sequentialExecution') : t('execLog.parallelExecution') })})</span>`;
    }
    
    if ((isApiCall || isPreselect || isReflection) && entry.apiRequest) {
      const info = [];
      if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
        info.push(`💬<span title="${t('execLog.messageCountTitle')}">${t('execLog.messageCount', { count: entry.apiRequest.messageCount })}</span>`);
      }
      if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
        info.push(`🔧<span title="${t('execLog.toolCountTitle')}">${t('execLog.toolCount', { count: entry.apiRequest.toolCount })}</span>`);
      }
      if (info.length > 0) {
        nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
      }
    }
    
    if (isToolExec) {
      const cmd = getToolCommandPreview(entry);
      if (cmd) {
        nodeName += ` <span class="node-cmd-preview" title="${escapeAttr(cmd)}">${escapeHtml(cmd)}</span>`;
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
            <span class="node-name" title="${escapeHtml(entry.nodeName || t('execLog.unknownNode'))}">${nodeName}</span>
            <span class="duration-badge" title="${t('execLog.durationTitle')}">${formatDuration(entry.duration || 0)}</span>
          </div>
          
          <div class="timeline-details">
            ${entry.thought && entry.thought.trim() ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionThought')}</div>
              <div class="section-content">${escapeHtml(entry.thought)}</div>
            </div>
            ` : ''}
            
            ${!isPreselect && entry.action ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionToolCall')}</div>
              <div class="section-content">
                <strong>${t('execLog.labelTool')}</strong> ${escapeHtml(entry.action.name)}<br>
                <strong>${t('execLog.labelParams')}</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
              </div>
            </div>
            ` : ''}
            
            ${isPreselect && entry.action?.params?.selected ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionFilterResult')}</div>
              <div class="section-content">
                <strong>${t('execLog.labelSelectedTools')}</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
                <strong>${t('execLog.labelCount')}</strong> ${entry.action.params.selected.length} ${t('execLog.unitItems')}
              </div>
            </div>
            ` : ''}
            
            ${entry.observation ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionObservation')}</div>
              <div class="section-content">${escapeHtml(entry.observation)}</div>
            </div>
            ` : ''}
            
            ${entry.apiRequest ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionApiRequest')}</div>
              <div class="section-content">
                ${entry.apiRequest.model ? `<strong>${t('execLog.labelModel')}</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
                ${entry.apiRequest.temperature !== undefined ? `<strong>${t('execLog.labelTemperature')}</strong> ${entry.apiRequest.temperature}<br>` : ''}
                ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
                ${entry.apiRequest.messageCount !== undefined ? `<strong>${t('execLog.labelMessageCount')}</strong> ${entry.apiRequest.messageCount}<br>` : ''}
                ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>${t('execLog.labelToolCount')}</strong> ${entry.apiRequest.toolCount}<br>` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.apiResponse ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionApiResponse')}</div>
              <div class="section-content">
                ${entry.apiResponse.finishReason ? `<strong>${t('execLog.labelFinishReason')}</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
                ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>${t('execLog.labelFilteredToolCount')}</strong> ${entry.apiResponse.toolCountAfter} ${t('execLog.unitItems')}<br>` : ''}
                ${entry.apiResponse.tokenUsage ? `
                  <strong>${t('execLog.labelTokenUsage')}</strong><br>
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || ((entry.apiResponse.tokenUsage.prompt_tokens || 0) + (entry.apiResponse.tokenUsage.completion_tokens || 0))}
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.error ? `
            <div class="timeline-section error">
              <div class="section-title">${t('execLog.sectionError')}</div>
              <div class="section-content">${escapeHtml(entry.error)}</div>
            </div>
            ` : ''}
            
            ${entry.result ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionSubtaskResult')}</div>
              <div class="section-content">${escapeHtml(entry.result)}</div>
            </div>
            ` : ''}
            
            ${isReflection ? `
            <div class="timeline-section reflection-details">
              ${entry.prompt ? `
              <div class="timeline-section">
                <div class="section-title">${t('execLog.sectionReflectionPrompt')}</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${escapeHtml(entry.prompt)}</pre></div>
              </div>
              ` : ''}
              ${entry.rawContent ? `
              <div class="timeline-section">
                <div class="section-title">${t('execLog.sectionReflectionRaw')}</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${escapeHtml(entry.rawContent)}</pre></div>
              </div>
              ` : ''}
              ${entry.apiResponse?.tokenUsage ? `
              <div class="timeline-section">
                <div class="section-title">${t('execLog.sectionTokenUsage')}</div>
                <div class="section-content">
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || ((entry.apiResponse.tokenUsage.prompt_tokens || 0) + (entry.apiResponse.tokenUsage.completion_tokens || 0))}
                </div>
              </div>
              ` : ''}
              ${entry.overallScore !== undefined && entry.overallScore !== null ? `
              <div class="section-title">${t('execLog.overallScore', { score: entry.overallScore })}</div>
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
              <div class="section-title">${t('execLog.sectionIssues')}</div>
              <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.suggestions && entry.suggestions.length > 0 ? `
              <div class="section-title">${t('execLog.sectionSuggestions')}</div>
              <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.action?.decision ? `
              <div class="section-title">${t('execLog.labelDecision', { decision: escapeHtml(entry.action.decision === 'passed' ? t('execLog.decisionPassed') : entry.action.decision === 'revised' ? t('execLog.decisionRevised') : entry.action.decision === 'needs_improvement' ? t('execLog.decisionNeedsImprovement') : entry.action.decision) })}</div>
              ` : ''}
              ${entry.useful !== undefined ? `
              <div class="section-title">${entry.useful ? t('execLog.resultUseful') : t('execLog.resultInvalid')}</div>
              ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
              ${entry.suggestion ? `<div class="section-content">${t('execLog.labelSuggestion', { suggestion: escapeHtml(entry.suggestion) })}</div>` : ''}
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
              <span class="task-group-count">${t('execLog.stepCount', { count: group.entries.length })}</span>
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
            <span class="main-tasks-name">${t('execLog.mainTask')}</span>
            <span class="main-tasks-count">${t('execLog.stepCount', { count: mainTasks.length })}</span>
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
  
  let nodeName = escapeHtml(entry.nodeName || t('execLog.unknownNode'));
  
  if (entry.subtaskCount) {
    nodeName += ` <span class="plan-badge">(${t('execLog.subtaskCountStrategy', { count: entry.subtaskCount, strategy: entry.strategy === 'sequential' ? t('execLog.sequentialExecution') : t('execLog.parallelExecution') })})</span>`;
  }
  
  if ((isApiCall || isPreselect) && entry.apiRequest) {
    const info = [];
    if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
      info.push(`💬<span title="${t('execLog.messageCountTitle')}">${t('execLog.messageCount', { count: entry.apiRequest.messageCount })}</span>`);
    }
    if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
      info.push(`🔧<span title="${t('execLog.toolCountTitle')}">${t('execLog.toolCount', { count: entry.apiRequest.toolCount })}</span>`);
    }
    if (info.length > 0) {
      nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
    }
  }
  
  if (isToolExec) {
    const cmd = getToolCommandPreview(entry);
    if (cmd) {
      nodeName += ` <span class="node-cmd-preview" title="${escapeAttr(cmd)}">${escapeHtml(cmd)}</span>`;
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
          <span class="node-name" title="${escapeHtml(entry.nodeName || t('execLog.unknownNode'))}">${nodeName}</span>
          <span class="duration-badge" title="${t('execLog.durationTitle')}">${formatDuration(entry.duration)}</span>
        </div>
        
        <div class="timeline-details">
          ${entry.thought && entry.thought.trim() ? `
          <div class="timeline-section">
            <div class="section-title">${t('execLog.sectionThought')}</div>
            <div class="section-content">${escapeHtml(entry.thought)}</div>
          </div>
          ` : ''}
          
          ${!isPreselect && entry.action ? `
          <div class="timeline-section">
            <div class="section-title">${t('execLog.sectionToolCall')}</div>
            <div class="section-content">
              <strong>${t('execLog.labelTool')}</strong> ${escapeHtml(entry.action.name)}<br>
              <strong>${t('execLog.labelParams')}</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
            </div>
          </div>
          ` : ''}
          
          ${isPreselect && entry.action?.params?.selected ? `
          <div class="timeline-section">
            <div class="section-title">${t('execLog.sectionFilterResult')}</div>
            <div class="section-content">
              <strong>${t('execLog.labelSelectedTools')}</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
              <strong>${t('execLog.labelCount')}</strong> ${entry.action.params.selected.length} ${t('execLog.unitItems')}
            </div>
          </div>
          ` : ''}
          
          ${entry.observation && entry.observation !== entry.error ? `
          <div class="timeline-section">
            <div class="section-title">${t('execLog.sectionObservation')}</div>
            <div class="section-content">${escapeHtml(entry.observation)}</div>
          </div>
          ` : ''}
          
          ${entry.apiRequest ? `
          <div class="timeline-section">
            <div class="section-title">${t('execLog.sectionApiRequest')}</div>
            <div class="section-content">
              ${entry.apiRequest.model ? `<strong>${t('execLog.labelModel')}</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
              ${entry.apiRequest.temperature !== undefined ? `<strong>${t('execLog.labelTemperature')}</strong> ${entry.apiRequest.temperature}<br>` : ''}
              ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
              ${entry.apiRequest.messageCount !== undefined ? `<strong>${t('execLog.labelMessageCount')}</strong> ${entry.apiRequest.messageCount}<br>` : ''}
              ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>${t('execLog.labelToolCount')}</strong> ${entry.apiRequest.toolCount}<br>` : ''}
            </div>
          </div>
          ` : ''}
          
          ${entry.apiResponse ? `
          <div class="timeline-section">
            <div class="section-title">${t('execLog.sectionApiResponse')}</div>
            <div class="section-content">
              ${entry.apiResponse.finishReason ? `<strong>${t('execLog.labelFinishReason')}</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
              ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>${t('execLog.labelFilteredToolCount')}</strong> ${entry.apiResponse.toolCountAfter} ${t('execLog.unitItems')}<br>` : ''}
              ${entry.apiResponse.tokenUsage ? `
                <strong>${t('execLog.labelTokenUsage')}</strong><br>
                - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                - Total: ${entry.apiResponse.tokenUsage.total_tokens || ((entry.apiResponse.tokenUsage.prompt_tokens || 0) + (entry.apiResponse.tokenUsage.completion_tokens || 0))}
              ` : ''}
            </div>
          </div>
          ` : ''}
          
          ${entry.error ? `
          <div class="timeline-section error">
            <div class="section-title">${t('execLog.sectionError')}</div>
            <div class="section-content">${escapeHtml(entry.error)}</div>
          </div>
          ` : ''}
          
          ${entry.result ? `
          <div class="timeline-section">
            <div class="section-title">${t('execLog.sectionSubtaskResult')}</div>
            <div class="section-content">${escapeHtml(entry.result)}</div>
          </div>
          ` : ''}
          
          ${isReflection ? `
          <div class="timeline-section reflection-details">
            ${entry.overallScore !== undefined && entry.overallScore !== null ? `
            <div class="section-title">${t('execLog.overallScore', { score: entry.overallScore })}</div>
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
            <div class="section-title">${t('execLog.sectionIssues')}</div>
            <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
            ` : ''}
            ${entry.suggestions && entry.suggestions.length > 0 ? `
            <div class="section-title">${t('execLog.sectionSuggestions')}</div>
            <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
            ` : ''}
            ${entry.action?.decision ? `
            <div class="section-title">${t('execLog.labelDecision', { decision: escapeHtml(entry.action.decision === 'passed' ? t('execLog.decisionPassed') : entry.action.decision === 'revised' ? t('execLog.decisionRevised') : entry.action.decision === 'needs_improvement' ? t('execLog.decisionNeedsImprovement') : entry.action.decision) })}</div>
            ` : ''}
            ${entry.useful !== undefined ? `
            <div class="section-title">${entry.useful ? t('execLog.resultUseful') : t('execLog.resultInvalid')}</div>
            ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
            ${entry.suggestion ? `<div class="section-content">${t('execLog.labelSuggestion', { suggestion: escapeHtml(entry.suggestion) })}</div>` : ''}
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
    
    let nodeName = escapeHtml(entry.nodeName || t('execLog.unknownNode'));
    
    if (entry.subtaskId) {
      nodeName = `<span class="subtask-badge">${currentSubtaskIndex !== null ? currentSubtaskIndex + 1 : ''}</span> ${nodeName}`;
    }
    
    if (entry.subtaskCount) {
      nodeName += ` <span class="plan-badge">(${t('execLog.subtaskCountStrategy', { count: entry.subtaskCount, strategy: entry.strategy === 'sequential' ? t('execLog.sequentialExecution') : t('execLog.parallelExecution') })})</span>`;
    }
    
    if ((isApiCall || isPreselect || isReflection) && entry.apiRequest) {
      const info = [];
      if (entry.apiRequest.messageCount !== undefined && entry.apiRequest.messageCount !== null) {
        info.push(`💬<span title="${t('execLog.messageCountTitle')}">${t('execLog.messageCount', { count: entry.apiRequest.messageCount })}</span>`);
      }
      if (!isPreselect && entry.apiRequest.toolCount !== undefined && entry.apiRequest.toolCount !== null) {
        info.push(`🔧<span title="${t('execLog.toolCountTitle')}">${t('execLog.toolCount', { count: entry.apiRequest.toolCount })}</span>`);
      }
      if (info.length > 0) {
        nodeName += ` <span class="api-info-badge">（${info.join(' ')}）</span>`;
      }
    }

    // 工具执行类：拼接命令/参数预览（与 timeline 渲染一致，宽度不足时省略号，悬停 title 显示完整）
    if (isToolExec) {
      const cmd = getToolCommandPreview(entry);
      if (cmd) {
        nodeName += ` <span class="node-cmd-preview" title="${escapeAttr(cmd)}">${escapeHtml(cmd)}</span>`;
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
            <span class="node-name" title="${escapeHtml(entry.nodeName || t('execLog.unknownNode'))}">${nodeName}</span>
            <span class="duration-badge" title="${t('execLog.durationTitle')}">${formatDuration(entry.duration)}</span>
          </div>
          
          <div class="timeline-details">
            ${entry.thought && entry.thought.trim() ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionThought')}</div>
              <div class="section-content">${escapeHtml(entry.thought)}</div>
            </div>
            ` : ''}
            
            ${!isPreselect && entry.action ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionToolCall')}</div>
              <div class="section-content">
                <strong>${t('execLog.labelTool')}</strong> ${escapeHtml(entry.action.name)}<br>
                <strong>${t('execLog.labelParams')}</strong> <code>${escapeHtml(JSON.stringify(entry.action.params, null, 2))}</code>
              </div>
            </div>
            ` : ''}
            
            ${isPreselect && entry.action?.params?.selected ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionFilterResult')}</div>
              <div class="section-content">
                <strong>${t('execLog.labelSelectedTools')}</strong> ${entry.action.params.selected.map(t => escapeHtml(t)).join(', ')}<br>
                <strong>${t('execLog.labelCount')}</strong> ${entry.action.params.selected.length} ${t('execLog.unitItems')}
              </div>
            </div>
            ` : ''}
            
            ${entry.observation ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionObservation')}</div>
              <div class="section-content">${escapeHtml(entry.observation)}</div>
            </div>
            ` : ''}
            
            ${entry.apiRequest ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionApiRequest')}</div>
              <div class="section-content">
                ${entry.apiRequest.model ? `<strong>${t('execLog.labelModel')}</strong> ${escapeHtml(entry.apiRequest.model)}<br>` : ''}
                ${entry.apiRequest.temperature !== undefined ? `<strong>${t('execLog.labelTemperature')}</strong> ${entry.apiRequest.temperature}<br>` : ''}
                ${entry.apiRequest.top_p !== undefined ? `<strong>top_p:</strong> ${entry.apiRequest.top_p}<br>` : ''}
                ${entry.apiRequest.messageCount !== undefined ? `<strong>${t('execLog.labelMessageCount')}</strong> ${entry.apiRequest.messageCount}<br>` : ''}
                ${!isPreselect && entry.apiRequest.toolCount !== undefined ? `<strong>${t('execLog.labelToolCount')}</strong> ${entry.apiRequest.toolCount}<br>` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.apiResponse ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionApiResponse')}</div>
              <div class="section-content">
                ${entry.apiResponse.finishReason ? `<strong>${t('execLog.labelFinishReason')}</strong> ${escapeHtml(entry.apiResponse.finishReason)}<br>` : ''}
                ${entry.apiResponse.toolCountAfter !== undefined ? `<strong>${t('execLog.labelFilteredToolCount')}</strong> ${entry.apiResponse.toolCountAfter} ${t('execLog.unitItems')}<br>` : ''}
                ${entry.apiResponse.tokenUsage ? `
                  <strong>${t('execLog.labelTokenUsage')}</strong><br>
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || ((entry.apiResponse.tokenUsage.prompt_tokens || 0) + (entry.apiResponse.tokenUsage.completion_tokens || 0))}
                ` : ''}
              </div>
            </div>
            ` : ''}
            
            ${entry.error ? `
            <div class="timeline-section error">
              <div class="section-title">${t('execLog.sectionError')}</div>
              <div class="section-content">${escapeHtml(entry.error)}</div>
            </div>
            ` : ''}
            
            ${entry.result ? `
            <div class="timeline-section">
              <div class="section-title">${t('execLog.sectionSubtaskResult')}</div>
              <div class="section-content">${escapeHtml(entry.result)}</div>
            </div>
            ` : ''}
            
            ${isReflection ? `
            <div class="timeline-section reflection-details">
              ${entry.prompt ? `
              <div class="timeline-section">
                <div class="section-title">${t('execLog.sectionReflectionPrompt')}</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${escapeHtml(entry.prompt)}</pre></div>
              </div>
              ` : ''}
              ${entry.rawContent ? `
              <div class="timeline-section">
                <div class="section-title">${t('execLog.sectionReflectionRaw')}</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${escapeHtml(entry.rawContent)}</pre></div>
              </div>
              ` : ''}
              ${entry.apiResponse?.tokenUsage ? `
              <div class="timeline-section">
                <div class="section-title">${t('execLog.sectionTokenUsage')}</div>
                <div class="section-content">
                  - Prompt: ${entry.apiResponse.tokenUsage.prompt_tokens || 0}<br>
                  - Completion: ${entry.apiResponse.tokenUsage.completion_tokens || 0}<br>
                  - Total: ${entry.apiResponse.tokenUsage.total_tokens || ((entry.apiResponse.tokenUsage.prompt_tokens || 0) + (entry.apiResponse.tokenUsage.completion_tokens || 0))}
                </div>
              </div>
              ` : ''}
              ${entry.overallScore !== undefined && entry.overallScore !== null ? `
              <div class="section-title">${t('execLog.overallScore', { score: entry.overallScore })}</div>
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
              <div class="section-title">${t('execLog.sectionIssues')}</div>
              <div class="section-content"><ul>${entry.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.suggestions && entry.suggestions.length > 0 ? `
              <div class="section-title">${t('execLog.sectionSuggestions')}</div>
              <div class="section-content"><ul>${entry.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>
              ` : ''}
              ${entry.action?.decision ? `
              <div class="section-title">${t('execLog.labelDecision', { decision: escapeHtml(entry.action.decision === 'passed' ? t('execLog.decisionPassed') : entry.action.decision === 'revised' ? t('execLog.decisionRevised') : entry.action.decision === 'needs_improvement' ? t('execLog.decisionNeedsImprovement') : entry.action.decision) })}</div>
              ` : ''}
              ${entry.useful !== undefined ? `
              <div class="section-title">${entry.useful ? t('execLog.resultUseful') : t('execLog.resultInvalid')}</div>
              ${entry.reasoning ? `<div class="section-content">${escapeHtml(entry.reasoning)}</div>` : ''}
              ${entry.suggestion ? `<div class="section-content">${t('execLog.labelSuggestion', { suggestion: escapeHtml(entry.suggestion) })}</div>` : ''}
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
    executingNode.textContent = status.nodeName || t('execLog.processingDots');
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
    : `<div class="realtime-waiting-message">${t('execLog.waitingExecution')}</div>`;
  
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
          <h3>${t('execLog.realtimeLogTitle')}</h3>
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
          <span class="realtime-executing-label">${t('execLog.executingLabel')}</span>
          <span class="realtime-executing-node">${t('execLog.preparing')}</span>
        </div>
        <div class="summary-combo">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">${t('execLog.totalNodes')}</span>
            <span class="combo-value">0</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success">
              <span class="stat-icon">✓</span>
              <span class="stat-label">${t('execLog.labelSuccess')}</span>
              <span class="stat-value">0</span>
            </div>
            <div class="combo-stat failed" data-status="failed">
              <span class="stat-icon">✗</span>
              <span class="stat-label">${t('execLog.labelFailed')}</span>
              <span class="stat-value">0</span>
            </div>
            <div class="combo-stat subtask" data-status="subtask" style="display:none">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">${t('execLog.labelSubtask')}</span>
              <span class="stat-value">0/0</span>
            </div>
          </div>
        </div>
        <div class="summary-actions">
          <button class="toggle-expand-btn" title="${t('execLog.expandAll')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="timeline">
        <div class="realtime-waiting-message">${t('execLog.waitingExecution')}</div>
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
      toggleExpandBtn.setAttribute('title', t('execLog.collapseAll'));
    } else {
      svg.innerHTML = '<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>';
      toggleExpandBtn.setAttribute('title', t('execLog.expandAll'));
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
  
  logger.debug('[SidePanel] updateExecutionStatus called:', nodeName, status, 'log count:', executionLog?.length);
  
  const nodeNameSpan = loadingDiv.querySelector('.current-node-name');
  if (nodeNameSpan) {
    nodeNameSpan.textContent = nodeName || t('execLog.processingDots');
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