// side_panel/schedule-panel.js - 定时任务管理面板（创建/编辑/删除/启停/立即执行）

import { escapeHtml, showToast } from './utils.js';
import { loadSessions } from '../storage/session-store.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  schedPanel: {
    toggleTitle: '定时任务',
    title: '定时任务',
    newTask: '新建任务',
    close: '关闭',
    empty: '暂无定时任务',
    nameLabel: '任务名称',
    descLabel: '任务描述（可选）',
    promptLabel: '任务指令',
    scheduleLabel: '定时规则',
    scheduleTypeOnce: '一次性',
    scheduleTypeInterval: '间隔',
    scheduleTypeCron: 'Cron 表达式',
    intervalValuePlaceholder: '例如：30m / 2h / 1d',
    cronValuePlaceholder: '例如：0 9 * * *',
    relativeValuePlaceholder: '例如：30',
    onceModeLabel: '执行方式',
    onceModeRelative: '多少分钟后',
    onceModeAbsolute: '指定时间点',
    valueLabelInterval: '间隔时间',
    valueLabelCron: 'Cron 表达式',
    minutesSuffix: ' 分钟后',
    contextUrlLabel: '上下文网页地址（可选）',
    useCurrentPage: '使用当前页面',
    sessionLabel: '宿主会话',
    sessionAuto: '自动（会话被删时自动新建）',
    save: '保存',
    cancel: '取消',
    edit: '编辑',
    editTitle: '编辑任务',
    delete: '删除',
    runNow: '立即执行',
    enable: '启用',
    disable: '停用',
    statusSuccess: '成功',
    statusFailed: '失败',
    statusRunning: '运行中',
    statusDisabled: '已停用',
    nextRun: '下次执行',
    deleted: '任务已删除',
    saved: '任务已保存',
    runNowToast: '已触发执行',
    deleteConfirmTitle: '删除定时任务',
    deleteConfirmMsg: '确定删除任务「{name}」吗？',
    createFailed: '创建任务失败',
    nameRequired: '请填写任务名称',
    promptRequired: '请填写任务指令',
    scheduleRequired: '请填写定时规则',
    loading: '加载中...',
    contextModeLabel: '网页上下文方式',
    contextModeFetch: '抓取网页正文',
    contextModeUrlOnly: '仅使用 URL（不抓正文）',
    maxRunsLabel: '最多执行次数（可选）',
    endAtLabel: '截止时间（可选）',
    runHistoryLabel: '运行历史',
    runHistoryEmpty: '暂无运行记录',
    runCountLabel: '运行历史 ({count})',
  },
});

registerTranslations('en', {
  schedPanel: {
    toggleTitle: 'Scheduled tasks',
    title: 'Scheduled tasks',
    newTask: 'New task',
    close: 'Close',
    empty: 'No scheduled tasks',
    nameLabel: 'Name',
    descLabel: 'Description (optional)',
    promptLabel: 'Prompt',
    scheduleLabel: 'Schedule',
    scheduleTypeOnce: 'Once',
    scheduleTypeInterval: 'Interval',
    scheduleTypeCron: 'Cron expression',
    intervalValuePlaceholder: 'e.g. 30m / 2h / 1d',
    cronValuePlaceholder: 'e.g. 0 9 * * *',
    relativeValuePlaceholder: 'e.g. 30',
    onceModeLabel: 'Run mode',
    onceModeRelative: 'After some minutes',
    onceModeAbsolute: 'At specific time',
    valueLabelInterval: 'Interval',
    valueLabelCron: 'Cron expression',
    minutesSuffix: ' minutes later',
    contextUrlLabel: 'Context page URL (optional)',
    useCurrentPage: 'Use current page',
    sessionLabel: 'Host session',
    sessionAuto: 'Auto (recreate if deleted)',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    editTitle: 'Edit task',
    delete: 'Delete',
    runNow: 'Run now',
    enable: 'Enable',
    disable: 'Disable',
    statusSuccess: 'Success',
    statusFailed: 'Failed',
    statusRunning: 'Running',
    statusDisabled: 'Disabled',
    nextRun: 'Next run',
    deleted: 'Task deleted',
    saved: 'Task saved',
    runNowToast: 'Execution triggered',
    deleteConfirmTitle: 'Delete scheduled task',
    deleteConfirmMsg: 'Delete task "{name}"?',
    createFailed: 'Failed to create task',
    nameRequired: 'Name is required',
    promptRequired: 'Prompt is required',
    scheduleRequired: 'Schedule is required',
    loading: 'Loading...',
    contextModeLabel: 'Page context mode',
    contextModeFetch: 'Fetch page content',
    contextModeUrlOnly: 'URL only',
    maxRunsLabel: 'Max runs (optional)',
    endAtLabel: 'End time (optional)',
    runHistoryLabel: 'Run history',
    runHistoryEmpty: 'No runs yet',
    runCountLabel: 'Run history ({count})',
  },
});

function send(cmd) {
  return chrome.runtime.sendMessage(cmd);
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1).replace(/\.0$/, '') + 's';
  return (ms / 60000).toFixed(1).replace(/\.0$/, '') + 'min';
}

function statusText(status) {
  if (status === 'success') return t('schedPanel.statusSuccess');
  if (status === 'failed') return t('schedPanel.statusFailed');
  if (status === 'running') return t('schedPanel.statusRunning');
  return '';
}

function toDatetimeLocal(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function describeSchedule(task) {
  const s = task.schedule || {};
  if (s.type === 'once') {
    if (s.onceMode === 'relative') return t('schedPanel.scheduleTypeOnce') + ' · ' + (s.value || '') + t('schedPanel.minutesSuffix');
    return t('schedPanel.scheduleTypeOnce') + ' · ' + fmtTime(new Date(s.value).getTime());
  }
  if (s.type === 'interval') return t('schedPanel.scheduleTypeInterval') + ' · ' + (s.value || '');
  if (s.type === 'cron') return t('schedPanel.scheduleTypeCron') + ' · ' + (s.value || '');
  return '';
}

function statusBadge(task) {
  if (!task.enabled) return `<span class="sched-badge muted">${t('schedPanel.statusDisabled')}</span>`;
  if (task.lastStatus === 'running') return `<span class="sched-badge running">${t('schedPanel.statusRunning')}</span>`;
  if (task.lastStatus === 'failed') return `<span class="sched-badge failed">${t('schedPanel.statusFailed')}</span>`;
  if (task.lastStatus === 'success') return `<span class="sched-badge success">${t('schedPanel.statusSuccess')}</span>`;
  return '';
}

export function initSchedulePanel() {
  const container = document.createElement('div');
  container.className = 'schedule-panel-container';
  container.id = 'schedulePanelContainer';
  container.innerHTML = `
    <style>
      .schedule-panel-container { position: fixed; right: 0; top: calc(50% + 200px); transform: translateY(-50%); z-index: 10002; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; width: 280px; background: transparent; }
      .schedule-panel-toggle { position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: linear-gradient(135deg, rgba(39, 174, 96, 0.85) 0%, rgba(31, 145, 80, 0.85) 100%); color: white; border: none; border-radius: 6px 0 0 6px; padding: 8px 4px; cursor: pointer; font-size: 14px; box-shadow: -2px 2px 8px rgba(39, 174, 96, 0.3); transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; opacity: 0.85; }
      .schedule-panel-toggle:hover { opacity: 1; box-shadow: -3px 3px 12px rgba(39, 174, 96, 0.4); }
      .schedule-panel-toggle svg { width: 16px; height: 16px; }
      .schedule-panel { position: absolute; right: 26px; bottom: 0; width: 360px; max-height: 70vh; background: rgba(255,255,255,1); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.5); display: none; flex-direction: column; overflow: hidden; }
      .schedule-panel.open { display: flex; }
      .schedule-panel-header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #eee; flex-shrink: 0; }
      .schedule-panel-header .title { font-weight: 600; font-size: 14px; flex: 1; }
      .schedule-panel-count { font-size: 12px; color: #8a94a6; }
      .schedule-panel-header button { border: none; background: transparent; cursor: pointer; font-size: 13px; padding: 4px 8px; border-radius: 6px; }
      .schedule-panel-header .new-btn { color: #fff; background: #4a6cf7; }
      .schedule-panel-header .close-btn { color: #8a94a6; }
      .schedule-panel-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
      .sched-item { border: 1px solid #eee; border-radius: 10px; padding: 10px 12px; }
      .sched-item .row1 { display: flex; align-items: center; gap: 8px; }
      .sched-item .name { font-weight: 600; font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sched-item .desc { font-size: 12px; color: #8a94a6; margin-top: 2px; }
      .sched-item .meta { font-size: 12px; color: #5b6b86; margin-top: 4px; }
      .sched-item .actions { display: flex; gap: 6px; margin-top: 8px; }
      .sched-item .actions button { border: 1px solid #e0e0e0; background: #fff; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer; }
      .sched-item .actions button:hover { background: #f5f7fa; }
      .sched-item .actions button.danger { color: #d94f4f; }
      .sched-item .actions button.primary { color: #4a6cf7; }
      .sched-badge { font-size: 11px; padding: 2px 6px; border-radius: 4px; }
      .sched-badge.success { background: #e6f7ec; color: #1a7f37; }
      .sched-badge.failed { background: #fdecec; color: #c0392b; }
      .sched-badge.running { background: #eef2ff; color: #4a6cf7; }
      .sched-badge.muted { background: #f0f1f3; color: #8a94a6; }
      .sched-empty { text-align: center; color: #8a94a6; font-size: 13px; padding: 24px 0; }
      .sched-history { margin-top: 8px; border-top: 1px dashed #eee; padding-top: 6px; }
      .sched-run { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #5b6b86; padding: 3px 0; }
      .sched-run .time { color: #8a94a6; }
      .sched-run .dur { color: #8a94a6; }
      .sched-run .err { display: block; color: #c0392b; margin-left: 4px; flex-basis: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sched-run .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .sched-run .dot.success { background: #2e9e5b; }
      .sched-run .dot.failed { background: #c0392b; }
      .sched-run .dot.running { background: #4a6cf7; }
      .sched-history-btn { border: none; background: transparent; color: #8a94a6; font-size: 11px; cursor: pointer; padding: 0; }
      .sched-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: none; align-items: center; justify-content: center; z-index: 10020; }
      .sched-modal-overlay.open { display: flex; }
      .sched-modal { width: 400px; max-width: 90vw; background: #fff; border-radius: 12px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
      .sched-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 12px; border-bottom: 1px solid #eee; flex-shrink: 0; }
      .sched-modal-header h3 { margin: 0; font-size: 15px; }
      .sched-modal-close { border: none; background: transparent; cursor: pointer; font-size: 14px; color: #8a94a6; padding: 2px 4px; border-radius: 4px; line-height: 1; }
      .sched-modal-close:hover { background: #f0f1f3; color: #5b6b86; }
      .sched-modal-body { padding: 12px 16px 4px; overflow-y: auto; flex: 1; min-height: 0; }
      .sched-modal .field { margin-bottom: 10px; }
      .sched-modal label { display: block; font-size: 12px; color: #5b6b86; margin-bottom: 4px; }
      .sched-modal input, .sched-modal textarea, .sched-modal select { width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 6px; padding: 7px 9px; font-size: 13px; }
      .sched-url-row { display: flex; gap: 6px; align-items: center; }
      .sched-url-row input { flex: 1; }
      .sched-use-current { white-space: nowrap; border: 1px solid #ddd; background: #f5f7fa; border-radius: 6px; padding: 7px 10px; font-size: 12px; cursor: pointer; color: #4a6cf7; }
      .sched-use-current:hover { background: #eef2ff; }
      .sched-modal textarea { resize: vertical; min-height: 64px; }
      .sched-modal .row { display: flex; gap: 8px; }
      .sched-modal .row .field { flex: 1; }
      .sched-modal .modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px 16px; border-top: 1px solid #eee; flex-shrink: 0; }
      .sched-modal .modal-actions button { border: 1px solid #ddd; background: #fff; border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
      .sched-modal .modal-actions .primary { background: #4a6cf7; color: #fff; border-color: #4a6cf7; }
    </style>
    <button class="schedule-panel-toggle" id="schedulePanelToggle" title="${t('schedPanel.toggleTitle')}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
        <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
      </svg>
    </button>
    <div class="schedule-panel" id="schedulePanel">
      <div class="schedule-panel-header">
        <span class="title">${t('schedPanel.title')}</span>
        <span class="schedule-panel-count" id="schedulePanelCount"></span>
        <button class="new-btn" id="scheduleNewTask">${t('schedPanel.newTask')}</button>
        <button class="close-btn" id="schedulePanelClose" title="${t('schedPanel.close')}">✕</button>
      </div>
      <div class="schedule-panel-list" id="schedulePanelList"></div>
    </div>
    `;
  document.body.appendChild(container);

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'sched-modal-overlay';
  modalOverlay.id = 'scheduleModalOverlay';
  modalOverlay.innerHTML = `
    <div class="sched-modal">
      <div class="sched-modal-header">
        <h3 id="scheduleModalTitle"></h3>
        <button type="button" class="sched-modal-close" id="scheduleModalCloseBtn" title="${t('schedPanel.close')}">✕</button>
      </div>
      <div class="sched-modal-body">
        <div class="field"><label>${t('schedPanel.nameLabel')}</label><input type="text" id="schedFormName" /></div>
        <div class="field"><label>${t('schedPanel.descLabel')}</label><input type="text" id="schedFormDesc" /></div>
        <div class="field"><label>${t('schedPanel.promptLabel')}</label><textarea id="schedFormPrompt"></textarea></div>
        <div class="field"><label>${t('schedPanel.scheduleLabel')}</label>
          <select id="schedFormType">
            <option value="once">${t('schedPanel.scheduleTypeOnce')}</option>
            <option value="interval">${t('schedPanel.scheduleTypeInterval')}</option>
            <option value="cron">${t('schedPanel.scheduleTypeCron')}</option>
          </select>
        </div>
        <div class="field" id="schedOnceModeWrap" style="display:none;"><label>${t('schedPanel.onceModeLabel')}</label>
          <select id="schedFormOnceMode">
            <option value="relative">${t('schedPanel.onceModeRelative')}</option>
            <option value="absolute">${t('schedPanel.onceModeAbsolute')}</option>
          </select>
        </div>
        <div class="field"><label id="schedValueLabel">${t('schedPanel.valueLabelInterval')}</label><input type="text" id="schedFormValue" /></div>
        <div class="row" id="schedEndWrap" style="display:none;">
          <div class="field"><label>${t('schedPanel.maxRunsLabel')}</label><input type="number" id="schedFormMaxRuns" min="1" /></div>
          <div class="field"><label>${t('schedPanel.endAtLabel')}</label><input type="datetime-local" id="schedFormEndAt" /></div>
        </div>
        <div class="field"><label>${t('schedPanel.contextUrlLabel')}</label>
          <div class="sched-url-row">
            <input type="text" id="schedFormUrl" placeholder="https://" />
            <button type="button" class="sched-use-current" id="schedUseCurrentPage">${t('schedPanel.useCurrentPage')}</button>
          </div>
        </div>
        <div class="field"><label>${t('schedPanel.contextModeLabel')}</label>
          <select id="schedFormContextMode">
            <option value="fetch">${t('schedPanel.contextModeFetch')}</option>
            <option value="url_only">${t('schedPanel.contextModeUrlOnly')}</option>
          </select>
        </div>
        <div class="field"><label>${t('schedPanel.sessionLabel')}</label><select id="schedFormSession"></select></div>
      </div>
      <div class="modal-actions">
        <button id="scheduleModalCancel">${t('schedPanel.cancel')}</button>
        <button class="primary" id="scheduleModalSave">${t('schedPanel.save')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  const toggle = document.getElementById('schedulePanelToggle');
  const panel = document.getElementById('schedulePanel');
  const closeBtn = document.getElementById('schedulePanelClose');
  const newBtn = document.getElementById('scheduleNewTask');
  const listEl = document.getElementById('schedulePanelList');
  const overlay = document.getElementById('scheduleModalOverlay');
  const modalTitle = document.getElementById('scheduleModalTitle');
  const cancelBtn = document.getElementById('scheduleModalCancel');
  const saveBtn = document.getElementById('scheduleModalSave');
  const typeSel = document.getElementById('schedFormType');
  const valueInput = document.getElementById('schedFormValue');
  const onceModeSel = document.getElementById('schedFormOnceMode');
  const onceModeWrap = document.getElementById('schedOnceModeWrap');
  const valueLabel = document.getElementById('schedValueLabel');
  const endWrap = document.getElementById('schedEndWrap');

  let editingTask = null;

  function updateScheduleInputs() {
    const type = typeSel.value;
    const onceMode = onceModeSel.value;
    onceModeWrap.style.display = (type === 'once') ? '' : 'none';
    endWrap.style.display = (type === 'interval') ? '' : 'none';

    if (type === 'once') {
      if (onceMode === 'relative') {
        valueLabel.textContent = t('schedPanel.onceModeRelative');
        valueInput.type = 'text';
        valueInput.placeholder = t('schedPanel.relativeValuePlaceholder');
      } else {
        valueLabel.textContent = t('schedPanel.onceModeAbsolute');
        valueInput.type = 'datetime-local';
        valueInput.placeholder = '';
      }
    } else if (type === 'interval') {
      valueLabel.textContent = t('schedPanel.valueLabelInterval');
      valueInput.type = 'text';
      valueInput.placeholder = t('schedPanel.intervalValuePlaceholder');
    } else {
      valueLabel.textContent = t('schedPanel.valueLabelCron');
      valueInput.type = 'text';
      valueInput.placeholder = t('schedPanel.cronValuePlaceholder');
    }
  }

  function setPanelOpen(open) {
    if (open) {
      panel.classList.add('open');
      refreshTaskList();
    } else {
      panel.classList.remove('open');
    }
  }

  toggle.addEventListener('click', () => {
    setPanelOpen(!panel.classList.contains('open'));
  });
  closeBtn.addEventListener('click', () => setPanelOpen(false));

  typeSel.addEventListener('change', updateScheduleInputs);
  onceModeSel.addEventListener('change', updateScheduleInputs);
  document.getElementById('scheduleModalCloseBtn').addEventListener('click', closeForm);
  cancelBtn.addEventListener('click', closeForm);
  saveBtn.addEventListener('click', submitForm);
  newBtn.addEventListener('click', () => openTaskForm(null));

  const useCurrentBtn = document.getElementById('schedUseCurrentPage');
  useCurrentBtn.addEventListener('click', async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tabs?.[0]?.url || '';
      if (url) document.getElementById('schedFormUrl').value = url;
    } catch { /* 非扩展上下文 */ }
  });

  async function refreshTaskList() {
    try {
      const res = await send({ type: 'SCHEDULED_TASK_LIST' });
      const tasks = res?.tasks || [];
      const countEl = document.getElementById('schedulePanelCount');
      if (countEl) countEl.textContent = tasks.length > 0 ? `(${tasks.length})` : '';
      renderTasks(tasks);
    } catch (e) {
      listEl.innerHTML = `<div class="sched-empty">${escapeHtml(String(e?.message || e))}</div>`;
    }
  }

  function renderRunHistory(runs) {
    if (!runs || !runs.length) return `<div class="sched-history"><div class="sched-run">${t('schedPanel.runHistoryEmpty')}</div></div>`;
    const items = runs.slice().reverse().map((r) => `
      <div class="sched-run">
        <span class="dot ${escapeHtml(r.status || '')}"></span>
        <span class="time">${escapeHtml(fmtTime(r.startedAt))}</span>
        <span>${escapeHtml(statusText(r.status))}</span>
        <span class="dur">${escapeHtml(fmtDuration(r.durationMs))}</span>
        ${r.error ? `<span class="err" title="${escapeHtml(r.error)}">${escapeHtml(r.error)}</span>` : ''}
      </div>
    `).join('');
    return `<div class="sched-history">${items}</div>`;
  }

  function renderTasks(tasks) {
    if (!tasks.length) {
      listEl.innerHTML = `<div class="sched-empty">${t('schedPanel.empty')}</div>`;
      return;
    }
    listEl.innerHTML = tasks.map((task) => {
      const runCount = task.runHistory?.length || 0;
      const historyBtn = runCount > 0
        ? `<button class="sched-history-btn" data-act="history">${t('schedPanel.runCountLabel', { count: runCount })}</button>`
        : '';
      return `
      <div class="sched-item" data-id="${escapeHtml(task.id)}">
        <div class="row1">
          <span class="name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
          ${statusBadge(task)}
        </div>
        ${task.description ? `<div class="desc">${escapeHtml(task.description)}</div>` : ''}
        <div class="meta">${escapeHtml(describeSchedule(task))}</div>
        <div class="meta">${t('schedPanel.nextRun')}: ${escapeHtml(fmtTime(task.nextRunAt))}</div>
        ${historyBtn}
        <div class="sched-history" data-history style="display:none;">${renderRunHistory(task.runHistory)}</div>
        <div class="actions">
          <button data-act="toggle" class="${task.enabled ? 'danger' : 'primary'}">${task.enabled ? t('schedPanel.disable') : t('schedPanel.enable')}</button>
          <button data-act="run" class="primary">${t('schedPanel.runNow')}</button>
          <button data-act="edit">${t('schedPanel.edit')}</button>
          <button data-act="delete" class="danger">${t('schedPanel.delete')}</button>
        </div>
      </div>
    `}).join('');
  }

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const item = btn.closest('.sched-item');
    const id = item?.dataset.id;
    if (!id) return;
    const act = btn.dataset.act;

    if (act === 'toggle') {
      const all = await loadTaskMap();
      const task = all[id];
      if (!task) return;
      await send({ type: 'SCHEDULED_TASK_TOGGLE', id, enabled: !task.enabled });
      refreshTaskList();
    } else if (act === 'run') {
      const res = await send({ type: 'SCHEDULED_TASK_RUN_NOW', id });
      if (res?.success) {
        showToast(t('schedPanel.runNowToast'), 'success');
        setTimeout(refreshTaskList, 1500);
      } else {
        showToast(res?.error || t('schedPanel.createFailed'), 'error');
      }
    } else if (act === 'history') {
      const historyEl = item.querySelector('[data-history]');
      if (historyEl) historyEl.style.display = historyEl.style.display === 'none' ? '' : 'none';
    } else if (act === 'edit') {
      const all = await loadTaskMap();
      openTaskForm(all[id]);
    } else if (act === 'delete') {
      const all = await loadTaskMap();
      const task = all[id];
      const ok = await window.showCustomConfirm(
        t('schedPanel.deleteConfirmMsg', { name: task?.name || '' }),
        t('schedPanel.deleteConfirmTitle')
      );
      if (ok) {
        await send({ type: 'SCHEDULED_TASK_DELETE', id });
        showToast(t('schedPanel.deleted'), 'success');
        refreshTaskList();
      }
    }
  });

  async function loadTaskMap() {
    const res = await send({ type: 'SCHEDULED_TASK_LIST' });
    const map = {};
    (res?.tasks || []).forEach((t) => { map[t.id] = t; });
    return map;
  }

  async function openTaskForm(task) {
    editingTask = task || null;
    modalTitle.textContent = task ? t('schedPanel.editTitle') : t('schedPanel.newTask');
    document.getElementById('schedFormName').value = task?.name || '';
    document.getElementById('schedFormDesc').value = task?.description || '';
    document.getElementById('schedFormPrompt').value = task?.prompt || '';
    document.getElementById('schedFormUrl').value = task?.contextUrl || '';
    typeSel.value = task?.schedule?.type || 'interval';
    onceModeSel.value = task?.schedule?.onceMode || 'relative';
    updateScheduleInputs();
    valueInput.value = task?.schedule?.value || '';
    document.getElementById('schedFormContextMode').value = task?.contextMode || 'fetch';
    document.getElementById('schedFormMaxRuns').value = task?.maxRuns ?? '';
    document.getElementById('schedFormEndAt').value = task?.endAt ? toDatetimeLocal(task.endAt) : '';

    // 会话选择器
    const sessionSel = document.getElementById('schedFormSession');
    let options = `<option value="">${t('schedPanel.sessionAuto')}</option>`;
    try {
      const { list } = await loadSessions();
      // 会话按时间倒序：最新的排在最上面
      const sorted = [...list].sort((a, b) => {
        const ao = a.order ?? 0;
        const bo = b.order ?? 0;
        if (ao !== bo) return bo - ao;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
      for (const s of sorted) {
        const selected = task?.sessionId === s.id ? 'selected' : '';
        const label = escapeHtml(s.title || s.id);
        options += `<option value="${escapeHtml(s.id)}" ${selected}>${label}</option>`;
      }
    } catch { /* 会话加载失败时仅提供自动选项 */ }
    sessionSel.innerHTML = options;

    overlay.classList.add('open');
  }

  function closeForm() {
    overlay.classList.remove('open');
    editingTask = null;
  }

  async function submitForm() {
    const name = document.getElementById('schedFormName').value.trim();
    const prompt = document.getElementById('schedFormPrompt').value.trim();
    const type = typeSel.value;
    const value = valueInput.value.trim();

    if (!name) { showToast(t('schedPanel.nameRequired'), 'warning'); return; }
    if (!prompt) { showToast(t('schedPanel.promptRequired'), 'warning'); return; }
    if (!value) { showToast(t('schedPanel.scheduleRequired'), 'warning'); return; }

    // 最大执行次数 / 截止时间仅对「间隔」类型生效，其余类型清空
    const maxRuns = type === 'interval'
      ? (parseInt(document.getElementById('schedFormMaxRuns').value, 10) || null)
      : null;
    const endAtRaw = type === 'interval' ? document.getElementById('schedFormEndAt').value : '';
    const endAt = endAtRaw ? new Date(endAtRaw).getTime() : null;

    const payload = {
      name,
      description: document.getElementById('schedFormDesc').value.trim(),
      prompt,
      schedule: type === 'once' ? { type, value, onceMode: onceModeSel.value } : { type, value },
      contextUrl: document.getElementById('schedFormUrl').value.trim() || null,
      contextMode: document.getElementById('schedFormContextMode').value || 'fetch',
      sessionId: document.getElementById('schedFormSession').value || null,
      maxRuns,
      endAt,
      enabled: editingTask ? editingTask.enabled : true,
    };

    try {
      const res = await send({
        type: editingTask ? 'SCHEDULED_TASK_UPDATE' : 'SCHEDULED_TASK_CREATE',
        task: editingTask ? { ...payload, id: editingTask.id } : payload,
      });
      if (res?.success) {
        showToast(t('schedPanel.saved'), 'success');
        closeForm();
        refreshTaskList();
      } else {
        showToast(res?.error || t('schedPanel.createFailed'), 'error');
      }
    } catch (e) {
      showToast(e?.message || t('schedPanel.createFailed'), 'error');
    }
  }

  // 后台定时任务执行完成（可能更新运行历史/状态/停用标记），面板打开时自动刷新列表
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SCHEDULED_SESSION_UPDATED' && panel.classList.contains('open')) {
      refreshTaskList().catch(() => {});
    }
  });

  updateScheduleInputs();
  setPanelOpen(false);
}