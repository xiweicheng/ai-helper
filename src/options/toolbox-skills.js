// options/toolbox-skills.js - Skill 管理
// 从 toolbox-config.js 拆分，包含 Skill 的增删改查、导入与运行

import { state, agentApi, escapeHtml, getAgentConnection, showCustomConfirm, showAgentSkillViewer, showToast, triggerRefresh } from './toolbox-shared.js';
import logger from '../shared/logger.js';
import { t } from '../shared/i18n.js';

// ==================== Skill 管理 ====================

/**
 * 获取 Skill 列表
 */
export async function loadSkills() {
  await getAgentConnection();
  if (!state.agentConnected) return { skills: [] };
  try {
    return await agentApi('GET', '/api/skill/list');
  } catch {
    return { skills: [] };
  }
}

/**
 * 渲染 Skill 列表（区分 Workflow 和 Agent 类型）
 */
export function renderSkills(skills) {
  const container = document.getElementById('skillList');
  if (!container) return;

  if (!state.agentConnected) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🔌</div>
        <div class="toolbox-empty-title">${t('toolbox.emptyAgentNotConnectedTitle')}</div>
        <div class="toolbox-empty-desc">${t('toolbox.emptyAgentNotConnectedDescSkill')}</div>
      </div>`;
    return;
  }

  if (!skills || skills.length === 0) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🧩</div>
        <div class="toolbox-empty-title">${t('toolbox.emptyNoSkillTitle')}</div>
        <div class="toolbox-empty-desc">${t('toolbox.emptyNoSkillDesc')}</div>
      </div>`;
    return;
  }

  const workflowSkills = skills.filter(s => s.type !== 'agent');
  const agentSkills = skills.filter(s => s.type === 'agent');

  let html = '';

  function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return { content: text, truncated: false };
  return {
    content: text.substring(0, maxLength) + '...',
    truncated: true,
    full: text
  };
}

// Workflow Skills
  if (workflowSkills.length > 0) {
    html += `<div class="skill-section-title">${t('toolbox.workflowSkillsTitle')}</div>`;
    html += workflowSkills.map(s => {
      const desc = truncateText(s.description || '', 120);
      const hasParams = s.parameters && s.parameters.properties && Object.keys(s.parameters.properties).length > 0;
      return `
      <div class="skill-card skill-card-workflow${s.enabled === false ? ' skill-disabled' : ''}">
        <div class="skill-card-header">
          <div class="skill-card-info">
            <span class="skill-card-icon">⚙️</span>
            <span class="skill-card-name">${escapeHtml(s.name)}</span>
            <span class="skill-card-version">v${escapeHtml(s.version || '1.0')}</span>
            <span class="skill-card-badge badge-workflow">Workflow</span>
            ${s.enabled === false ? `<span class="skill-card-badge badge-disabled">${t('toolbox.disable')}</span>` : ''}
            <span class="skill-card-step-count">${t('toolbox.stepCount', { count: s.stepCount || 0 })}</span>
          </div>
        </div>
        <div class="skill-card-body${s.enabled === false ? ' disabled' : ''}">
          <div class="skill-card-desc">${escapeHtml(desc.content)}</div>
          ${desc.truncated && s.enabled !== false ? `<button class="skill-expand-btn" data-skill-name="${escapeHtml(s.name)}" data-target="desc" data-full="${encodeURIComponent(s.description || '')}">${t('toolbox.expand')}</button>` : ''}
          ${hasParams ? `
          <div class="skill-card-params">
            ${renderSkillParams(s.parameters)}
          </div>` : ''}
          <div class="skill-card-actions">
            ${s.enabled !== false ? `<button class="toolbox-btn toolbox-btn-primary" data-skill-name="${escapeHtml(s.name)}" data-action="run-skill">${t('toolbox.run')}</button>` : ''}
            <button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="toggle-skill">${s.enabled === false ? t('toolbox.enable') : t('toolbox.disable')}</button>
            <button class="toolbox-btn toolbox-btn-danger" data-skill-name="${escapeHtml(s.name)}" data-action="delete-skill">${t('common.delete')}</button>
          </div>
        </div>
      </div>
    `}).join('');
  }

  // Agent Skills
  if (agentSkills.length > 0) {
    html += `<div class="skill-section-title">${t('toolbox.agentSkillsTitle')}</div>`;
    html += agentSkills.map(s => {
      const isBuiltin = s.builtin === true;
      const canEdit = s.editable !== false;
      const canDelete = s.deletable !== false;
      const desc = truncateText(s.description || '', 120);
      const hasResources = s.resources && s.resources.length > 0;
      const showResourcesInFull = !hasResources || s.resources.length <= 5;
      return `
      <div class="skill-card skill-card-agent${s.enabled === false ? ' skill-disabled' : ''}">
        <div class="skill-card-header">
          <div class="skill-card-info">
            <span class="skill-card-icon">🤖</span>
            <span class="skill-card-name">${escapeHtml(s.name)}</span>
            <span class="skill-card-version">v${escapeHtml(s.version || '1.0')}</span>
            <span class="skill-card-badge badge-agent">Agent</span>
            ${isBuiltin ? `<span class="skill-card-badge badge-builtin">${t('toolbox.builtin')}</span>` : ''}
            ${s.enabled === false ? `<span class="skill-card-badge badge-disabled">${t('toolbox.disable')}</span>` : ''}
            <span class="skill-card-step-count">${t('toolbox.resourceCount', { count: s.resourceCount || 0 })}</span>
          </div>
        </div>
        <div class="skill-card-body${s.enabled === false ? ' disabled' : ''}">
          <div class="skill-card-desc">${escapeHtml(desc.content)}</div>
          ${desc.truncated && s.enabled !== false ? `<button class="skill-expand-btn" data-skill-name="${escapeHtml(s.name)}" data-target="desc" data-full="${encodeURIComponent(s.description || '')}">${t('toolbox.expand')}</button>` : ''}
          ${hasResources ? `
          <div class="skill-card-params">
            ${showResourcesInFull
              ? s.resources.map(r => `<span class="skill-param-tag" title="${t('toolbox.sizeBytes', { size: r.size })}">📄 ${escapeHtml(r.name)}</span>`).join('')
              : s.resources.slice(0, 5).map(r => `<span class="skill-param-tag" title="${t('toolbox.sizeBytes', { size: r.size })}">📄 ${escapeHtml(r.name)}</span>`).join('') + `<button class="skill-expand-btn skill-expand-resources" data-skill-name="${escapeHtml(s.name)}" data-target="resources" data-full="${encodeURIComponent(JSON.stringify(s.resources))}">${t('toolbox.moreCount', { count: s.resources.length - 5 })}</button>`
            }
          </div>` : ''}
          <div class="skill-card-actions">
            ${canEdit ? `<button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="edit-agent-skill">${t('toolbox.editSkillMd')}</button>` : `<button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="view-agent-skill">${t('toolbox.viewDetails')}</button>`}
            <button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="toggle-skill">${s.enabled === false ? t('toolbox.enable') : t('toolbox.disable')}</button>
            ${canDelete ? `<button class="toolbox-btn toolbox-btn-danger" data-skill-name="${escapeHtml(s.name)}" data-action="delete-skill">${t('common.delete')}</button>` : ''}
          </div>
        </div>
      </div>
    `}).join('');
  }

  container.innerHTML = html;
}

/**
 * 渲染 Skill 参数
 */
export function renderSkillParams(parameters) {
  if (!parameters || !parameters.properties) return '';
  const props = parameters.properties;
  const required = parameters.required || [];

  return Object.entries(props).map(([key, prop]) => {
    const isRequired = required.includes(key);
    return `<span class="skill-param-tag ${isRequired ? 'required' : ''}" title="${escapeHtml(prop.description || '')}">${escapeHtml(key)}${isRequired ? '*' : ''}</span>`;
  }).join('');
}

/**
 * 导入 Workflow Skill
 */
export async function importSkill(skillDef) {
  const result = await agentApi('POST', '/api/skill/import', skillDef);
  if (result.success) return true;
  throw new Error(result.error || t('toolbox.skillImportFailedShort'));
}

/**
 * 删除 Skill
 */
export async function deleteSkill(name) {
  const result = await agentApi('DELETE', '/api/skill/delete', { name });
  if (result.success) return true;
  throw new Error(result.error || t('toolbox.skillDeleteFailedShort'));
}

/**
 * 切换 Skill 启用/停用状态
 */
export async function toggleSkill(name) {
  const result = await agentApi('POST', '/api/skill/toggle', { name });
  if (result.success) return result.enabled !== false;
  throw new Error(result.error || t('toolbox.skillOperationFailedShort'));
}

/**
 * 运行 Workflow Skill
 */
export async function runSkill(name, params = {}) {
  const result = await agentApi('POST', '/api/skill/run', { name, params });
  return result;
}

/**
 * 解析 Skill 的参数定义（兼容 JSON Schema 格式）
 */
export function parseSkillParams(skill) {
  const params = skill.parameters || {};
  // 兼容 JSON Schema 格式: { type: "object", properties: {...}, required: [...] }
  const props = params.properties || {};
  const requiredList = Array.isArray(params.required) ? params.required : [];
  const entries = Object.entries(props);
  return {
    hasRequired: entries.length > 0,
    required: entries.filter(([key]) => requiredList.includes(key)),
    optional: entries.filter(([key]) => !requiredList.includes(key)),
    all: entries
  };
}

/**
 * 显示 Skill 参数输入弹窗
 * @returns {Promise<Object|null>} - 用户填写的参数，取消则返回 null
 */
export function showSkillParamsDialog(skillName, paramsDef) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    // 生成参数输入字段
    const requiredFields = paramsDef.required.map(([key, def]) => `
      <div class="form-group">
        <label for="skill-param-${key}">${escapeHtml(def.description || key)} <span class="param-required">${t('toolbox.required')}</span></label>
        <input type="text" id="skill-param-${key}" class="form-input"
               placeholder="${escapeHtml(def.type || 'string')}${def.default !== undefined ? t('toolbox.defaultParamHint', { default: def.default }) : ''}" />
      </div>
    `).join('');

    const optionalFields = paramsDef.optional.map(([key, def]) => `
      <div class="form-group">
        <label for="skill-param-${key}">${escapeHtml(def.description || key)} <span class="param-optional">${t('toolbox.optional')}</span></label>
        <input type="text" id="skill-param-${key}" class="form-input"
               placeholder="${escapeHtml(def.type || 'string')}${def.default !== undefined ? t('toolbox.defaultParamHint', { default: def.default }) : ''}" />
      </div>
    `).join('');

    overlay.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header">
          <h2>${t('toolbox.runSkillTitle', { name: skillName })}</h2>
          <button class="modal-close-btn" id="skillParamsCancel">×</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 16px;color:#666;font-size:13px;">${t('toolbox.fillParamsHint')}</p>
          ${requiredFields}
          ${paramsDef.required.length > 0 && paramsDef.optional.length > 0 ? '<div style="border-top:1px dashed #e0e0e0;margin:12px 0;"></div>' : ''}
          ${optionalFields}
        </div>
        <div class="modal-actions">
          <button class="btn btn-cancel" id="skillParamsCancel">${t('common.cancel')}</button>
          <button class="btn btn-primary" id="skillParamsSubmit">${t('toolbox.run')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); resolve(null); };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll('#skillParamsCancel').forEach(btn => {
      btn.addEventListener('click', close);
    });

    overlay.querySelector('#skillParamsSubmit').addEventListener('click', () => {
      const values = {};
      let allRequiredFilled = true;
      for (const [key, def] of paramsDef.required) {
        const input = overlay.querySelector(`#skill-param-${key}`);
        const val = input?.value?.trim();
        if (!val) {
          allRequiredFilled = false;
          if (input) input.style.borderColor = '#e53e3e';
        } else {
          values[key] = val;
          if (input) input.style.borderColor = '';
        }
      }
      for (const [key] of paramsDef.optional) {
        const input = overlay.querySelector(`#skill-param-${key}`);
        if (input) {
          values[key] = input.value;
        }
      }
      if (!allRequiredFilled) return;
      overlay.remove();
      resolve(values);
    });

    // 回车提交
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        overlay.querySelector('#skillParamsSubmit').click();
      }
    });

    // 自动聚焦第一个输入框
    const firstInput = overlay.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  });
}
export function showSkillRunResult(name, skillInfo, result) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'skillResultModal';

  const steps = skillInfo?.success ? (skillInfo.skill?.steps || []) : [];
  const stepMap = {};
  steps.forEach(s => { stepMap[s.id] = s; });

  const results = result.results || {};
  const stepIds = Object.keys(results);

  let stepsHtml = '';
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  if (stepIds.length === 0) {
    stepsHtml = `<div style="padding:16px;text-align:center;color:#999;">${result.error || t('toolbox.noExecutionResult')}</div>`;
  } else {
    stepsHtml = stepIds.map((stepId, idx) => {
      const stepRes = results[stepId];
      const stepDef = stepMap[stepId] || {};
      const stepName = stepDef.name || stepDef.description || stepId;
      const tool = stepDef.tool || '';
      const isSuccess = stepRes?.success;
      const isSkipped = stepRes?.skipped;

      if (isSkipped) skipCount++;
      else if (isSuccess) successCount++;
      else failCount++;

      const statusIcon = isSkipped ? '⊘' : (isSuccess ? '✓' : '✗');
      const statusClass = isSkipped ? 'step-skipped' : (isSuccess ? 'step-success' : 'step-error');
      const outputText = isSkipped
        ? (stepRes.message || t('toolbox.conditionNotMetSkipped'))
        : (isSuccess
          ? (stepRes.content || stepRes.stdout || stepRes.message || t('toolbox.executionSuccess'))
          : (stepRes.error || t('toolbox.executionFailed')));

      // 截断过长输出
      const truncated = outputText.length > 500
        ? outputText.substring(0, 500) + `\n${t('toolbox.truncated', { count: outputText.length })}`
        : outputText;

      return `
        <div class="skill-run-step ${statusClass}">
          <div class="step-header">
            <span class="step-status-icon">${statusIcon}</span>
            <span class="step-title">${escapeHtml(stepName)}</span>
            ${tool ? `<span class="step-tool-tag">${escapeHtml(tool)}</span>` : ''}
          </div>
          <pre class="step-output">${escapeHtml(truncated)}</pre>
        </div>
      `;
    }).join('');
  }

  const icon = result.success ? '✓' : '✗';
  const statusText = result.success ? t('toolbox.executionComplete') : t('toolbox.executionFailed');
  const summaryText = result.success
    ? t('toolbox.executionSummary', { success: successCount, fail: failCount, skip: skipCount })
    : (result.error || t('agentConfig.unknownError'));

  overlay.innerHTML = `
    <div class="modal-content" style="max-width:700px;max-height:85vh;">
      <div class="modal-header">
        <h2>${icon} ${t('toolbox.skillRunResultTitle', { name, status: statusText })}</h2>
        <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="max-height:calc(85vh - 120px);overflow-y:auto;">
        <div class="skill-run-summary">${escapeHtml(summaryText)}</div>
        ${stepsHtml}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary modal-close-btn">${t('common.close')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('modal-close-btn')) {
      overlay.remove();
    }
  });
}

/**
 * 重新加载 Skill
 */
export async function reloadSkills() {
  const result = await agentApi('POST', '/api/skill/reload');
  return result;
}

/**
 * 导入 Agent Skill（从 JSON/Markdown/Zip/URL）
 */
export async function importAgentSkill(skillData) {
  // 判断导入方式
  if (skillData.markdown || skillData.prompt) {
    // Markdown 内容直接保存
    return await agentApi('POST', '/api/skill/save-markdown', skillData);
  } else if (skillData.zipData) {
    // Base64 Zip 导入
    return await agentApi('POST', '/api/skill/import-zip', skillData);
  } else if (skillData.url) {
    // URL 导入
    return await agentApi('POST', '/api/skill/import-url', skillData);
  }
  throw new Error(t('toolbox.invalidSkillDataFormat'));
}

/**
 * 获取 Agent Skill 的 SKILL.md 内容
 */
export async function getAgentSkillMarkdown(name) {
  return await agentApi('GET', `/api/skill/markdown?name=${encodeURIComponent(name)}`);
}

/**
 * 显示 Agent Skill 编辑器弹窗
 */
export function showAgentSkillEditor(skillName, existingData = null) {
  const existingModal = document.getElementById('agentSkillEditorModal');
  if (existingModal) existingModal.remove();

  const isEdit = !!existingData;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.id = 'agentSkillEditorModal';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-content agent-skill-editor-container';
  modalContainer.style.width = '700px';
  modalContainer.style.maxHeight = '85vh';

  modalContainer.innerHTML = `
    <div class="modal-header">
      <h3>${isEdit ? t('toolbox.editAgentSkill') : t('toolbox.newAgentSkill')}</h3>
      <button class="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>${t('toolbox.skillNameLabel')}</label>
        <input type="text" id="agentSkillName" placeholder="e.g. code-review" value="${escapeHtml(isEdit ? existingData.name : '')}" ${isEdit ? 'readonly' : ''}>
      </div>
      <div class="form-group">
        <label>${t('toolbox.skillDescLabel')}</label>
        <input type="text" id="agentSkillDesc" placeholder="${t('toolbox.skillDescPlaceholder')}" value="${escapeHtml(isEdit ? (existingData.frontmatter?.description || '') : '')}">
      </div>
      <div class="form-group">
        <label>${t('toolbox.skillVersionLabel')}</label>
        <input type="text" id="agentSkillVersion" placeholder="1.0" value="${escapeHtml(isEdit ? (existingData.frontmatter?.version || '1.0') : '1.0')}">
      </div>
      <div class="form-group">
        <label>${t('toolbox.skillMarkdownLabel')}</label>
        <textarea id="agentSkillMarkdown" style="min-height: 300px; font-family: monospace;" placeholder="${t('toolbox.skillMarkdownPlaceholder')}">${escapeHtml(isEdit ? (existingData.markdown || '') : '')}</textarea>
      </div>
      ${isEdit && existingData.resources && existingData.resources.length > 0 ? `
      <div class="form-group">
        <label>${t('toolbox.existingResources')}</label>
        <div class="skill-resource-list">
          ${existingData.resources.map(r => `<span class="skill-resource-tag">📄 ${escapeHtml(r.name)} (${r.size} ${t('common.bytes')})</span>`).join('')}
        </div>
      </div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="cancelAgentSkillBtn">${t('common.cancel')}</button>
      <button class="btn btn-primary" id="saveAgentSkillBtn" style="width: auto;">${t('common.save')}</button>
    </div>
  `;

  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  // 关闭
  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#cancelAgentSkillBtn').addEventListener('click', closeModal);

  // 保存
  modalOverlay.querySelector('#saveAgentSkillBtn').addEventListener('click', async () => {
    const name = modalOverlay.querySelector('#agentSkillName').value.trim();
    const description = modalOverlay.querySelector('#agentSkillDesc').value.trim();
    const version = modalOverlay.querySelector('#agentSkillVersion').value.trim() || '1.0';
    const markdown = modalOverlay.querySelector('#agentSkillMarkdown').value.trim();
    const enabled = isEdit ? (existingData.frontmatter?.enabled !== false) : true;

    if (!name) return showToast(t('toolbox.skillNameRequired'), 'error');
    if (!markdown) return showToast(t('toolbox.skillMarkdownRequired'), 'error');

    try {
      const result = await agentApi('POST', '/api/skill/save-markdown', {
        name, description, version, markdown, enabled
      });
      if (result.success) {
        showToast(t('toolbox.agentSkillSaved', { name }), 'success');
        closeModal();
        triggerRefresh();
      } else {
        showToast(result.error || t('toolbox.saveFailedShort'), 'error');
      }
    } catch (err) {
      showToast(t('toolbox.saveFailed', { error: err.message }), 'error');
    }
  });
}

/**
 * 显示 Zip/URL 导入弹窗
 */
export function showImportDialog() {
  const existingModal = document.getElementById('skillImportModal');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.id = 'skillImportModal';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-content';
  modalContainer.style.width = '640px';

  modalContainer.innerHTML = `
    <div class="modal-header">
      <h3>${t('toolbox.importSkillTitle')}</h3>
      <button class="modal-close-btn">&times;</button>
    </div>
    <div style="padding: 0 24px 8px 24px;">
      <div class="import-tabs">
        <button class="import-tab active" data-tab="json">${t('toolbox.jsonImport')}</button>
        <button class="import-tab" data-tab="markdown">${t('toolbox.newAuthoring')}</button>
        <button class="import-tab" data-tab="zip">${t('toolbox.zipPackage')}</button>
        <button class="import-tab" data-tab="url">${t('toolbox.urlImport')}</button>
      </div>

      <!-- JSON Import -->
      <div class="import-panel active" data-panel="json">
        <div class="import-panel-desc">${t('toolbox.jsonImportDesc')}</div>
        <div class="upload-drop-zone" id="jsonDropZone">
          <span class="upload-icon">📄</span>
          <span class="upload-text">${t('toolbox.clickOrDragJson')}</span>
          <span class="upload-hint">${t('toolbox.jsonFileHint')}</span>
          <input type="file" id="skillJsonFile" accept=".json">
        </div>
      </div>

      <!-- Agent Skill Markdown -->
      <div class="import-panel" data-panel="markdown">
        <div class="import-panel-desc">${t('toolbox.markdownImportDesc')}</div>
        <div class="form-group">
          <label>${t('toolbox.skillNameLabel')}</label>
          <input type="text" id="quickAgentName" placeholder="${t('toolbox.skillNameExamplePlaceholder')}">
        </div>
        <div class="form-group">
          <label>${t('toolbox.skillDescLabel')}</label>
          <input type="text" id="quickAgentDesc" placeholder="${t('toolbox.skillDescScenePlaceholder')}">
        </div>
        <div class="form-group">
          <label>${t('toolbox.skillMarkdownLabel')}</label>
          <textarea id="quickAgentMarkdown" style="min-height: 180px; font-family: 'SF Mono', 'Monaco', 'Menlo', monospace; font-size: 13px; line-height: 1.6;" placeholder="${t('toolbox.skillMarkdownPlaceholderShort')}"></textarea>
        </div>
      </div>

      <!-- Zip Import -->
      <div class="import-panel" data-panel="zip">
        <div class="import-panel-desc">${t('toolbox.zipImportDesc')}</div>
        <div class="upload-drop-zone" id="zipDropZone">
          <span class="upload-icon">📦</span>
          <span class="upload-text">${t('toolbox.clickOrDragZip')}</span>
          <span class="upload-hint">${t('toolbox.zipFileHint')}</span>
          <input type="file" id="skillZipFile" accept=".zip">
        </div>
      </div>

      <!-- URL Import -->
      <div class="import-panel" data-panel="url">
        <div class="import-panel-desc">${t('toolbox.urlImportDesc')}</div>
        <div class="form-group">
          <label>${t('toolbox.downloadUrl')}</label>
          <div class="url-input-wrapper">
            <span class="url-input-icon">🔗</span>
            <input type="url" id="skillUrl" placeholder="https://example.com/skills/my-skill.zip">
          </div>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="cancelImportBtn">${t('common.cancel')}</button>
      <button class="btn btn-primary" id="confirmImportBtn" style="width: auto;">${t('toolbox.importBtn')}</button>
    </div>
  `;

  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#cancelImportBtn').addEventListener('click', closeModal);

  // Tab 切换
  modalOverlay.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modalOverlay.querySelectorAll('.import-tab').forEach(tabEl => tabEl.classList.remove('active'));
      tab.classList.add('active');
      modalOverlay.querySelectorAll('.import-panel').forEach(p => p.classList.remove('active'));
      modalOverlay.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });

  // Drop Zone 点击触发 file input
  const setupDropZone = (zoneId, fileInputId) => {
    const zone = modalOverlay.querySelector(zoneId);
    const input = modalOverlay.querySelector(fileInputId);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = '#667eea'; zone.style.background = '#f5f7ff'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = '#d0d5dd'; zone.style.background = '#fafbfc'; });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = '#d0d5dd';
      zone.style.background = '#fafbfc';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        input.files = files;
        showDropFileName(zone, files[0].name);
      }
    });

    input.addEventListener('change', () => {
      if (input.files && input.files[0]) {
        showDropFileName(zone, input.files[0].name);
      }
    });
  };

  const showDropFileName = (zone, name) => {
    zone.classList.add('has-file');
    const existing = zone.querySelector('.file-name');
    if (existing) existing.remove();
    const nameEl = document.createElement('span');
    nameEl.className = 'file-name';
    nameEl.textContent = `✓ ${name}`;
    zone.appendChild(nameEl);
  };

  setupDropZone('#jsonDropZone', '#skillJsonFile');
  setupDropZone('#zipDropZone', '#skillZipFile');

  // 确认导入
  modalOverlay.querySelector('#confirmImportBtn').addEventListener('click', async () => {
    const activeTab = modalOverlay.querySelector('.import-tab.active')?.dataset.tab;

    try {
      if (activeTab === 'json') {
        const fileInput = modalOverlay.querySelector('#skillJsonFile');
        const file = fileInput.files[0];
        if (!file) return showToast(t('toolbox.selectJsonFile'), 'warning');

        const text = await file.text();
        const skillDef = JSON.parse(text);
        await importSkill(skillDef);
        showToast(t('toolbox.workflowSkillImported', { name: skillDef.name }), 'success');
      } else if (activeTab === 'markdown') {
        const name = modalOverlay.querySelector('#quickAgentName').value.trim();
        const description = modalOverlay.querySelector('#quickAgentDesc').value.trim();
        const markdown = modalOverlay.querySelector('#quickAgentMarkdown').value.trim();
        if (!name) return showToast(t('toolbox.skillNameRequired'), 'warning');
        if (!markdown) return showToast(t('toolbox.skillMarkdownRequired'), 'warning');

        const result = await agentApi('POST', '/api/skill/save-markdown', {
          name, description, version: '1.0', markdown
        });
        if (result.success) {
          showToast(t('toolbox.agentSkillCreated', { name }), 'success');
        } else {
          return showToast(result.error || t('toolbox.createFailedShort'), 'error');
        }
      } else if (activeTab === 'zip') {
        const fileInput = modalOverlay.querySelector('#skillZipFile');
        const file = fileInput.files[0];
        if (!file) return showToast(t('toolbox.selectZipFile'), 'warning');

        // 文件大小限制：50MB
        const MAX_ZIP_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_ZIP_SIZE) {
          return showToast(t('toolbox.fileTooLarge'), 'warning');
        }

        // 使用 FileReader 安全地将文件转为 base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(new Error(t('toolbox.fileReadFailed')));
          reader.readAsDataURL(file);
        });
        const result = await agentApi('POST', '/api/skill/import-zip', { zipData: base64 });
        if (result.success) {
          showToast(t('toolbox.agentSkillImported', { name: result.skill?.name || 'unknown' }), 'success');
        } else {
          return showToast(result.error || t('toolbox.skillImportFailedShort'), 'error');
        }
      } else if (activeTab === 'url') {
        const url = modalOverlay.querySelector('#skillUrl').value.trim();
        if (!url) return showToast(t('toolbox.urlRequired'), 'warning');

        const result = await agentApi('POST', '/api/skill/import-url', { url });
        if (result.success) {
          showToast(t('toolbox.agentSkillImported', { name: result.skill?.name || 'unknown' }), 'success');
        } else {
          return showToast(result.error || t('toolbox.skillImportFailedShort'), 'error');
        }
      }

      closeModal();
      triggerRefresh();
    } catch (err) {
      showToast(t('toolbox.importFailed', { error: err.message }), 'error');
    }
  });
}


// Skill 管理函数已通过 export 暴露给 toolbox-config.js
